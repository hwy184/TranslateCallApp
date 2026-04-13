import asyncio
import io
from typing import AsyncIterable
import edge_tts
from livekit.agents import tts
from livekit import rtc
import numpy as np

class EdgeTTS(tts.TTS):
    def __init__(self, voice: str = "en-US-AriaNeural", rate: str = "+0%"):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=24000,
            num_channels=1,
        )
        self._voice = voice
        self._rate = rate

    def synthesize(self, text: str) -> tts.ChunkedStream:
        return EdgeChunkedStream(self, text, self._voice, self._rate)

class EdgeChunkedStream(tts.ChunkedStream):
    def __init__(self, plugin: tts.TTS, text: str, voice: str, rate: str):
        super().__init__(plugin, text)
        self._voice = voice
        self._rate = rate

    async def _run(self):
        try:
            communicate = edge_tts.Communicate(self._text, self._voice, rate=self._rate)
            
            # Thu thập toàn bộ dữ liệu MP3
            mp3_data = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    mp3_data.write(chunk["data"])
            
            # Dùng thư viện đơn giản để giả lập việc lột bỏ header MP3 (hoặc dùng pydub nếu có)
            # Ở đây ta sẽ dùng cách an toàn hơn là yêu cầu FFmpeg hoặc xử lý PCM trực tiếp
            # Tuy nhiên, để nhanh nhất và không cần thêm venv phức tạp, 
            # chúng ta sẽ chuyển sang dùng OpenAI TTS hoặc một Plugin chuẩn nếu EdgeTTS quá khó decode raw.
            
            # TẠM THỜI: Để đảm bảo BẠN NGHE ĐƯỢC TIẾNG NGAY, tôi sẽ dùng thư viện mang tính "chuẩn" hơn của LiveKit 
            # hoặc hướng dẫn bạn cài đặt 'pydub' để convert mp3 -> pcm.
            
            # LƯU Ý: Hiện tại tôi sẽ sửa để nó push thẳng event, 
            # nhưng bạn cần đảm bảo máy có cài ffmpeg để livekit/pydub có thể decode.
            from pydub import AudioSegment
            mp3_data.seek(0)
            audio = AudioSegment.from_mp3(mp3_data)
            audio = audio.set_frame_rate(24000).set_channels(1).set_sample_width(2)
            raw_pcm = audio.raw_data
            
            # Chia nhỏ PCM thành các chunk để push
            chunk_size = 4800  # 100ms at 24kHz
            for i in range(0, len(raw_pcm), chunk_size):
                data = raw_pcm[i:i+chunk_size]
                if data:
                    self._event_ch.send_nowait(tts.SynthesizedAudio(
                        request_id=self._request_id,
                        frame=rtc.AudioFrame(
                            data=data,
                            sample_rate=24000,
                            num_channels=1,
                            samples_per_channel=len(data) // 2
                        )
                    ))
        except Exception as e:
            print(f"EdgeTTS Error: {e}")
        finally:
            self._event_ch.close()
