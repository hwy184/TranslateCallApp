import asyncio
import numpy as np
import whisper
from livekit.agents import stt
from typing import Optional
from utils.text_filter import filter_hallucination

class LocalWhisperSTT(stt.STT):
    def __init__(self, model_name: str = "turbo", device: str = "cuda"):
        super().__init__()
        self._model = whisper.load_model(model_name, device=device)

    async def _transcribe_sync(self, audio: np.ndarray, language: Optional[str] = None):
        # Whisper model output is wrapped in a dedicated thread to not block event loop
        result = self._model.transcribe(
            audio,
            language=language,
            fp16=True,
            beam_size=5,
        )
        return result

    def stream(self, language: Optional[str] = None) -> "LocalWhisperSpeechStream":
        return LocalWhisperSpeechStream(self, language)

class LocalWhisperSpeechStream(stt.SpeechStream):
    def __init__(self, stt_instance: LocalWhisperSTT, language: Optional[str] = None):
        super().__init__()
        self._stt = stt_instance
        self._language = language
        self._queue = asyncio.Queue()

    def push_frame(self, frame: "rtc.AudioFrame"):
        # Chuyển đổi rtc.AudioFrame của LiveKit sang NumPy cho Whisper
        # LiveKit mặc định dùng PCM 16bit, cần đổi sang float32 [-1, 1] cho Whisper
        audio_np = np.frombuffer(frame.data, dtype=np.int16).astype(np.float32) / 32768.0
        self._queue.put_nowait(audio_np)

    async def _run(self):
        while True:
            # Thu thập các chunk từ hàng đợi để tạo thành đoạn âm thanh (VAD đã xử lý ở Pipeline)
            audio_data = await self._queue.get()
            
            # Giả lập logic xử lý đồng bộ trong executor để tránh treo event loop
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, 
                lambda: self._stt._model.transcribe(
                    audio_data, 
                    language=self._language,
                    fp16=True
                )
            )

            detected_text = result.get("text", "").strip()
            # Áp dụng bộ lọc ảo giác
            clean_text = filter_hallucination(detected_text)
            
            if clean_text:
                # Emit kết quả về LiveKit stream
                event = stt.SpeechEvent(
                    type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                    alternatives=[stt.SpeechAlternative(text=clean_text, language=result.get("language", "vi"))]
                )
                self._event_emitter.emit("data", event)
