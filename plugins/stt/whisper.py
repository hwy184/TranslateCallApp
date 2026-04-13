import asyncio
import numpy as np
import whisper
import torch
from livekit.agents import stt, APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS
from typing import Optional, List
from utils.text_filter import filter_hallucination

class LocalWhisperSTT(stt.STT):
    def __init__(self, model_name: str = "turbo", device: Optional[str] = None):
        # Tự động nhận diện thiết bị
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        
        super().__init__(capabilities=stt.STTCapabilities(
            streaming=True,
            interim_results=False
        ))
        
        print(f"Loading Whisper model '{model_name}' on device: {device}")
        self._model = whisper.load_model(model_name, device=device)

    @property
    def model(self) -> str:
        return "whisper-turbo"

    @property
    def provider(self) -> str:
        return "openai-local"

    async def _recognize_impl(self, buffer: List[np.ndarray], *, language: Optional[str] = None, conn_options: APIConnectOptions) -> stt.SpeechEvent:
        # Phương thức này dùng cho việc nhận diện cả một buffer lớn (offline)
        raise NotImplementedError("Offline recognition is not implemented yet")

    def stream(self, *, language: Optional[str] = None, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS) -> "LocalWhisperRecognizeStream":
        return LocalWhisperRecognizeStream(stt=self, language=language, conn_options=conn_options)

class LocalWhisperRecognizeStream(stt.RecognizeStream):
    def __init__(self, stt: LocalWhisperSTT, language: Optional[str], conn_options: APIConnectOptions):
        super().__init__(stt=stt, conn_options=conn_options, sample_rate=16000)
        self._stt = stt
        self._language = language

    async def _run(self):
        # 1.5.x sử dụng self._input_ch (async channel) để nhận AudioFrame
        # Chúng ta sẽ thu thập đủ data rồi mới transcribe khi nhận FlushSentinel
        audio_buffer = []
        
        async for frame in self._input_ch:
            if isinstance(frame, stt.RecognizeStream._FlushSentinel):
                # Khi có tín hiệu Flush (hết một đoạn nói)
                if not audio_buffer:
                    continue
                
                # Nối các chunk lại thành một mảng numpy duy nhất
                audio_np = np.concatenate(audio_buffer)
                audio_buffer = []
                
                # Thực hiện nhận diện (chế độ non-blocking)
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None, 
                    lambda: self._stt._model.transcribe(
                        audio_np, 
                        language=self._language,
                        fp16=True
                    )
                )

                detected_text = result.get("text", "").strip()
                clean_text = filter_hallucination(detected_text)
                
                if clean_text:
                    event = stt.SpeechEvent(
                        type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                        alternatives=[stt.SpeechData(text=clean_text, language=result.get("language", "vi"))]
                    )
                    # Gửi event về cho Agent qua _event_ch (async channel)
                    self._event_ch.send_nowait(event)
            else:
                # Chuyển AudioFrame sang Numpy float32 (-1.0 to 1.0)
                # Ensure the same sample rate (Whisper usually expects 16k)
                data = np.frombuffer(frame.data, dtype=np.int16).astype(np.float32) / 32768.0
                audio_buffer.append(data)
