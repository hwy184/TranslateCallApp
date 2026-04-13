import asyncio
import functools
import time
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import whisper
import httpx
import base64
import os
import edge_tts

app = FastAPI(title="Realtime Translation - Ollama + Gemma 4")

# ═══════════════════════════════════════
# CẤU HÌNH
# ═══════════════════════════════════════
OLLAMA_MODEL = "gemma4:e4b"
MAX_CONTEXT  = 3
# ═══════════════════════════════════════

print("🔄 Tải Whisper turbo (large-v3-turbo)...")
whisper_model = whisper.load_model("turbo", device="cuda")
print("✅ Whisper turbo sẵn sàng!")

# ═══════════════════════════════════════
# WHISPER: Nhận dạng giọng nói → Văn bản
# ═══════════════════════════════════════

# Danh sách câu ảo giác Whisper hay tự đẻ ra khi chỉ nghe tạp âm
HALLUCINATION_BLACKLIST = [
    "subscribe", "lalaschool", "mì gõ", "ghiền mì", "subcribe", 
    "like and share", "bấm chuông", "kênh youtube", "video hấp dẫn",
    "cảm ơn các bạn đã xem", "hẹn gặp lại", "đăng ký kênh", "ủng hộ kênh",
    "kham phat", "khám phá", "top 10", "chào mừng các bạn", "theo dõi kênh",
]

def _transcribe_sync(audio_np: np.ndarray, prev_context: str = "") -> tuple[str, str]:
    """Blocking transcription - trả về (văn bản, ngôn ngữ)"""
    audio_np = np.array(audio_np, dtype=np.float32, copy=True)

    result = whisper_model.transcribe(
        audio_np,
        language=None, # <--- Tự động nhận diện ngôn ngữ
        fp16=True,
        initial_prompt=prev_context if prev_context else None,
        condition_on_previous_text=False,
        beam_size=5,
    )

    detected_lang = result.get("language", "vi")
    
    segments_text = []
    for seg in result.get("segments", []):
        no_speech = seg.get("no_speech_prob", 0)
        seg_text = seg["text"].strip()
        
        # 1. Lọc theo xác suất im lặng (Whisper tự nhận là rác)
        if no_speech > 0.45:
            continue
            
        # 2. Lọc TUYỆT ĐỐI theo Blacklist (Vì người dùng bình thường hiếm khi nói mấy từ này khi đang dịch)
        if any(bl in seg_text.lower().replace(" ", "") for bl in HALLUCINATION_BLACKLIST):
            print(f"  🚫 Đã chặn ảo giác: {seg_text}")
            continue
        
        if seg_text:
            segments_text.append(seg_text)

    final_text = " ".join(segments_text).strip()
    return final_text, detected_lang


async def transcribe(audio_np: np.ndarray, prev_context: str = "") -> tuple[str, str]:
    """Non-blocking wrapper: trả về (văn bản, ngôn ngữ)"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, functools.partial(_transcribe_sync, audio_np, prev_context)
    )


# ═══════════════════════════════════════
# OLLAMA: Dịch Việt → Anh
# ═══════════════════════════════════════

async def translate(text: str, source_lang: str, context: list[dict]) -> str:
    # Điều chỉnh System Prompt theo ngôn ngữ nguồn
    lang_map = {"vi": "Vietnamese", "en": "English", "ja": "Japanese", "ko": "Korean", "fr": "French", "zh": "Chinese"}
    source_lang_name = lang_map.get(source_lang, source_lang)

    messages = [
        {
            "role": "system",
            "content": (
                f"You are a professional {source_lang_name}-to-English translator. "
                f"Translate the user's {source_lang_name} text to natural English. "
                "Output ONLY the English translation. No quotes, no explanations."
            )
        }
    ]

    for c in context[-MAX_CONTEXT:]:
        messages.append({"role": "user", "content": c["vi"]})
        messages.append({"role": "assistant", "content": c["en"]})

    messages.append({"role": "user", "content": text})

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            print(f"  📡 Gọi Ollama ({OLLAMA_MODEL}) [Dịch từ {source_lang}]...")
            t0 = time.time()
            resp = await client.post("http://localhost:11434/api/chat", json={
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 256}
            })
            resp.raise_for_status()
            elapsed = time.time() - t0
            translation = resp.json().get("message", {}).get("content", "").strip()
            print(f"  ✅ Ollama trả lời sau {elapsed:.1f}s")
            return translation
    except httpx.ConnectError:
        print("  ❌ Không kết nối được Ollama!")
        return "[ERROR: Ollama not running]"
    except httpx.TimeoutException:
        print("  ❌ Ollama timeout!")
        return "[ERROR: timeout]"
    except Exception as e:
        print(f"  ❌ Ollama lỗi: {e}")
        return f"[ERROR: {e}]"


# ═══════════════════════════════════════
# WEBSOCKET HANDLER
# ═══════════════════════════════════════

@app.websocket("/ws/translate")
async def ws_translate(websocket: WebSocket):
    await websocket.accept()
    client_ip = websocket.client.host
    print(f"🟢 Client kết nối: {client_ip}")

    context = []

    try:
        while True:
            audio_bytes = await websocket.receive_bytes()
            audio_np = np.frombuffer(audio_bytes, dtype=np.float32)
            duration = len(audio_np) / 16000
            volume = np.abs(audio_np).mean()
            print(f"\n  📦 Nhận {duration:.1f}s | Volume: {volume:.4f}")

            # Bỏ qua im lặng
            if volume < 0.02:
                print(f"  🔇 Im lặng, bỏ qua")
                await websocket.send_json({"vi": "", "en": "", "skipped": True})
                continue

            # Whisper: audio → text + language detection
            print(f"  🎙️ Whisper đang nghe...")
            t0 = time.time()
            prev_txt = " ".join([c["vi"] for c in context[-2:]])
            text, lang = await transcribe(audio_np, prev_txt)
            whisper_time = time.time() - t0
            print(f"  ⏱️ Whisper ({lang}): {whisper_time:.1f}s")

            if not text:
                print("  ⚠️ Không nhận dạng được")
                await websocket.send_json({"vi": "", "en": "", "skipped": True})
                continue
            print(f"  [{lang.upper()}] {text}")

            # Ollama: dịch dựa trên ngôn ngữ nhận diện được
            en_text = await translate(text, lang, context)
            print(f"  [EN] {en_text}")
            
            # TTS: Đọc luôn câu tiếng Anh bằng Edge-TTS (Giọng Aria Neural của Microsoft)
            audio_b64 = ""
            if en_text:
                try:
                    temp_mp3 = f"temp_tts_{id(websocket)}.mp3"
                    print("  🔊 Đang tổng hợp giọng nói tiếng Anh (Edge-TTS)...")
                    t0_tts = time.time()
                    
                    communicate = edge_tts.Communicate(en_text, "en-US-AriaNeural", rate="+15%")
                    await communicate.save(temp_mp3)
                    
                    with open(temp_mp3, "rb") as f:
                        audio_b64 = base64.b64encode(f.read()).decode('utf-8')
                        
                    os.remove(temp_mp3)
                    print(f"  ✅ TTS hoàn tất sau {time.time()-t0_tts:.1f}s")
                except Exception as e:
                    print(f"  ❌ Lỗi Edge-TTS: {e}")

            # Lưu context
            context.append({"vi": text, "en": en_text})
            if len(context) > MAX_CONTEXT:
                context.pop(0)

            # Trả kết quả cho client
            await websocket.send_json({
                "vi": text,
                "en": en_text,
                "audio_b64": audio_b64,
                "skipped": False
            })

    except WebSocketDisconnect:
        print(f"🔴 Client ngắt kết nối: {client_ip}")
    except Exception as e:
        print(f"❌ Lỗi: {e}")
        try:
            await websocket.close()
        except:
            pass

@app.get("/health")
async def health():
    return {"status": "ok", "model": OLLAMA_MODEL}

@app.get("/")
async def root():
    return {"message": "VI→EN Translation Server", "ws": "/ws/translate"}