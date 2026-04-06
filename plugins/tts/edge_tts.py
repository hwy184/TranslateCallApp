import asyncio
import io
import edge_tts
from pydub import AudioSegment
from livekit.agents import tts
from livekit import rtc
from typing import Optional, AsyncIterable, Union

class EdgeTTS(tts.TTS):
    def __init__(self, voice: str = "en-US-AriaNeural", rate: str = "+0%"):
        super().__init__(capabilities=tts.TTSCapabilities(streaming=True))
        self._voice = voice
        self._rate = rate

    def synthesize(self, text: str) -> "EdgeTTSStream":
        return EdgeTTSStream(text, self._voice, self._rate)

class EdgeTTSStream(tts.SynthesizedSpeech):
    def __init__(self, text: str, voice: str, rate: str):
        super().__init__()
        self._text = text
        self._voice = voice
        self._rate = rate

    async def __aiter__(self) -> AsyncIterable[rtc.AudioFrame]:
        # Khởi tạo công cụ giao tiếp với Edge-TTS
        communicate = edge_tts.Communicate(self._text, self._voice, rate=self._rate)
        
        # Buffer để thu thập dữ liệu MP3 thô
        mp3_buffer = io.BytesIO()
        
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                mp3_buffer.write(chunk["data"])
        
        # Reset buffer để giải mã
        mp3_buffer.seek(0)
        
        # Sử dụng pydub để giải mã MP3 sang PCM
        # NOTE: Cần cài đặt ffmpeg trên hệ thống để pydub hoạt động
        try:
            audio_segment = AudioSegment.from_file(mp3_buffer, format="mp3")
            
            # Chuẩn hóa về Mono, Sample Rate mong muốn (ví dụ 24kHz)
            audio_segment = audio_segment.set_channels(1).set_frame_rate(24000)
            
            # Lấy dữ liệu PCM thô
            raw_pcm = audio_segment.raw_data # int16
            
            # Chia nhỏ PCM thành các AudioFrame của LiveKit (mặc định 20ms mỗi frame)
            # 24k sample/s * 2 bytes/sample * 0.02s = 960 bytes mỗi frame
            frame_size = int(24000 * 2 * 0.02)
            
            for i in range(0, len(raw_pcm), frame_size):
                chunk_pcm = raw_pcm[i : i + frame_size]
                if len(chunk_pcm) < frame_size:
                    # Pad zero nếu chunk cuối bị thiếu
                    chunk_pcm += b'\x00' * (frame_size - len(chunk_pcm))
                
                yield rtc.AudioFrame(
                    data=chunk_pcm,
                    sample_rate=24000,
                    num_channels=1,
                    samples_per_channel=int(24000 * 0.02)
                )
        except Exception as e:
            print(f"Error decoding Edge-TTS audio: {e}")
            return
