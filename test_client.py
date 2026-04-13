"""
test_server.py — Standalone pipeline test server (no LiveKit required)
Exposes:
  POST /api/transcribe   — upload audio → STT text
  POST /api/translate    — text → translated text (Ollama)
  POST /api/speak        — text → MP3 audio (Edge-TTS)
  POST /api/pipeline     — audio → STT → translate → audio (full pipeline)
  WS   /ws               — real-time: send audio chunks, receive JSON events
"""
import asyncio
import io
import json
import logging
import os
import tempfile
import time

import httpx
import numpy as np
import edge_tts
import whisper
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydub import AudioSegment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test-server")

app = FastAPI(title="Voice Translate Test Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Lazy-loaded models ────────────────────────────────────────────────────────
_whisper_model = None

def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        logger.info("Loading Whisper model (base)…")
        _whisper_model = whisper.load_model("base")
    return _whisper_model


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:2b")

SYSTEM_PROMPT = (
    "You are a professional interpreter. "
    "Translate the following Vietnamese speech into natural English. "
    "Output ONLY the English translation — no notes, no explanations."
)


# ── Helpers ───────────────────────────────────────────────────────────────────
async def run_stt(audio_bytes: bytes, fmt: str = "webm") -> str:
    """Convert audio bytes → text using local Whisper."""
    with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        # Convert to WAV 16kHz mono for Whisper
        seg = AudioSegment.from_file(tmp_path)
        seg = seg.set_channels(1).set_frame_rate(16000)
        wav_path = tmp_path + ".wav"
        seg.export(wav_path, format="wav")

        model = get_whisper()
        result = model.transcribe(wav_path, language="vi", task="transcribe")
        return result["text"].strip()
    finally:
        for p in [tmp_path, tmp_path + ".wav"]:
            try:
                os.remove(p)
            except Exception:
                pass


async def run_llm(text: str) -> str:
    """Translate text via Ollama."""
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "stream": False,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
            },
        )
        r.raise_for_status()
        data = r.json()
        return data["message"]["content"].strip()


async def run_tts(text: str, rate: str = "+15%") -> bytes:
    """Convert English text → MP3 bytes via Edge-TTS."""
    communicate = edge_tts.Communicate(text, voice="en-US-JennyNeural", rate=rate)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    return buf.getvalue()


# ── REST Endpoints ────────────────────────────────────────────────────────────
@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """STT only: upload audio → Vietnamese text."""
    t0 = time.perf_counter()
    audio = await file.read()
    fmt = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "webm"
    text = await run_stt(audio, fmt)
    return {"text": text, "latency_ms": round((time.perf_counter() - t0) * 1000)}


@app.post("/api/translate")
async def translate(text: str = Form(...)):
    """LLM only: Vietnamese text → English text."""
    t0 = time.perf_counter()
    result = await run_llm(text)
    return {"translation": result, "latency_ms": round((time.perf_counter() - t0) * 1000)}


@app.post("/api/speak")
async def speak(text: str = Form(...)):
    """TTS only: English text → MP3 audio stream."""
    mp3 = await run_tts(text)
    return StreamingResponse(io.BytesIO(mp3), media_type="audio/mpeg")


@app.post("/api/pipeline")
async def full_pipeline(file: UploadFile = File(...)):
    """Full pipeline: audio → STT → LLM → TTS, returns JSON + audio."""
    timings = {}

    audio = await file.read()
    fmt = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "webm"

    t0 = time.perf_counter()
    vn_text = await run_stt(audio, fmt)
    timings["stt_ms"] = round((time.perf_counter() - t0) * 1000)

    t0 = time.perf_counter()
    en_text = await run_llm(vn_text)
    timings["llm_ms"] = round((time.perf_counter() - t0) * 1000)

    t0 = time.perf_counter()
    mp3 = await run_tts(en_text)
    timings["tts_ms"] = round((time.perf_counter() - t0) * 1000)

    import base64
    return {
        "stt": vn_text,
        "translation": en_text,
        "audio_b64": base64.b64encode(mp3).decode(),
        "timings": timings,
    }


# ── WebSocket real-time endpoint ──────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_pipeline(websocket: WebSocket):
    """
    Client sends: JSON {"type":"audio","data":"<base64 webm>"}
    Server sends: {"type":"stt","text":"..."} then {"type":"translation","text":"..."} then {"type":"audio","data":"<base64 mp3>"}
    """
    await websocket.accept()
    logger.info("WebSocket client connected")
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") != "audio":
                continue

            import base64
            audio_bytes = base64.b64decode(msg["data"])
            fmt = msg.get("format", "webm")

            # STT
            await websocket.send_text(json.dumps({"type": "status", "text": "Transcribing…"}))
            vn_text = await run_stt(audio_bytes, fmt)
            await websocket.send_text(json.dumps({"type": "stt", "text": vn_text}))

            # LLM
            await websocket.send_text(json.dumps({"type": "status", "text": "Translating…"}))
            en_text = await run_llm(vn_text)
            await websocket.send_text(json.dumps({"type": "translation", "text": en_text}))

            # TTS
            await websocket.send_text(json.dumps({"type": "status", "text": "Synthesizing speech…"}))
            mp3 = await run_tts(en_text)
            import base64 as b64
            await websocket.send_text(json.dumps({"type": "audio", "data": b64.b64encode(mp3).decode()}))

            await websocket.send_text(json.dumps({"type": "done"}))

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.send_text(json.dumps({"type": "error", "text": str(e)}))


# Serve static UI
if os.path.exists("static_test"):
    app.mount("/", StaticFiles(directory="static_test", html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)