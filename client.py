# client.py - Real-time Vietnamese→English Translation Client
# Kiến trúc Producer-Consumer: Thu âm KHÔNG BAO GIỜ bị dừng khi chờ server
import asyncio
import websockets
import numpy as np
import sounddevice as sd
import soundfile as sf
import json
import os
import io
import base64
import tempfile
import pygame

# Bật Engine nhạc để phát audio không cần FFMPEG
pygame.mixer.init()

# ═══════════════════════════════════════
# CẤU HÌNH
# ═══════════════════════════════════════
SERVER_URL        = "ws://localhost:8000/ws/translate"
SAMPLE_RATE       = 16000
CHANNELS          = 1
SILENCE_THRESHOLD = 0.05
SILENCE_SECS      = 0.8       # Ngắt nghỉ 0.8s = kết thúc cụm từ
SMALL_CHUNK_SECS  = 0.1       # Đọc mic mỗi 100ms (mượt hơn)
MAX_RECORD_SECS   = 5.0       # Tối đa 5s mỗi chunk
MIN_RECORD_SECS   = 1.2       # Tối thiểu 1.2s mới gửi (lọc tạp âm)
OVERLAP_SECS      = 0.5       # Gối đầu 0.5 giây cuối để khỏi bị đứt từ
# ═══════════════════════════════════════

def list_input_devices():
    devices = sd.query_devices()
    inputs = []
    print("\n🎤 Danh sách thiết bị input:")
    print("─" * 50)
    for i, d in enumerate(devices):
        if d["max_input_channels"] > 0:
            inputs.append(i)
            print(f"  [{i}] {d['name']}")
    print("─" * 50)
    return inputs

def select_device() -> int:
    input_ids = list_input_devices()
    default = sd.default.device[0]
    print(f"\n  Mặc định hiện tại: [{default}] {sd.query_devices(default)['name']}")
    while True:
        try:
            choice = input("\n👉 Nhập số thứ tự thiết bị (Enter = dùng mặc định): ").strip()
            if choice == "":
                print(f"✅ Dùng thiết bị mặc định: [{default}]")
                return default
            choice = int(choice)
            if choice in input_ids:
                print(f"✅ Đã chọn: [{choice}] {sd.query_devices(choice)['name']}")
                return choice
            else:
                print("❌ Số không hợp lệ, thử lại!")
        except ValueError:
            print("❌ Nhập số thôi!")

async def connect_with_retry():
    """Kết nối WebSocket với auto-reconnect"""
    while True:
        try:
            ws = await websockets.connect(SERVER_URL, ping_timeout=120, max_size=10*1024*1024)
            print("✅ Đã kết nối server!")
            return ws
        except Exception as e:
            print(f"⚠️  Kết nối thất bại: {e}")
            print("🔄 Thử lại sau 2 giây...")
            await asyncio.sleep(2)


async def producer(device_id: int, audio_queue: asyncio.Queue):
    """
    PRODUCER: Thu âm liên tục từ mic, cắt chunk theo VAD, đẩy vào queue.
    Luồng này KHÔNG BAO GIỜ bị block bởi network I/O.
    """
    SMALL_CHUNK    = int(SAMPLE_RATE * SMALL_CHUNK_SECS)
    SILENCE_CHUNKS = int(SILENCE_SECS / SMALL_CHUNK_SECS)
    MAX_CHUNKS     = int(MAX_RECORD_SECS / SMALL_CHUNK_SECS)

    buffer        = []
    silence_count = 0
    is_speaking   = False

    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype=np.float32,
        device=device_id,
        blocksize=SMALL_CHUNK,
    ) as stream:

        # --- BƯỚC HIỆU CHUẨN (AUTO CALIBRATE) ---
        print("🔍 Đang đo tiếng ồn môi trường (Vui lòng không nói gì trong 1 giây)...")
        noise_samples = []
        for _ in range(int(1.0 / SMALL_CHUNK_SECS)):
            chunk, _ = stream.read(SMALL_CHUNK)
            noise_samples.append(np.abs(chunk).mean())
        
        avg_noise = np.mean(noise_samples)
        # Ngưỡng im lặng = Tiếng ồn trung bình + 0.025 (mạnh mẽ hơn để lọc tiếng thở)
        adaptive_threshold = max(0.04, avg_noise + 0.025)
        print(f"✅ Đã hiệu chuẩn: Tiếng ồn trung bình: {avg_noise:.4f} | Ngưỡng im lặng tự động: {adaptive_threshold:.4f}\n")
        print("🔇 Sẵn sàng! Chờ tiếng nói...\n")

        while True:
            chunk, _ = stream.read(SMALL_CHUNK)
            
            # --- CHỐNG LẶP (ECHO CANCELLATION): Bỏ qua mic nếu đang phát loa ---
            if pygame.mixer.music.get_busy():
                silence_count = 0
                is_speaking   = False
                buffer        = []
                await asyncio.sleep(0)
                continue

            chunk = chunk.flatten().copy()
            volume = np.abs(chunk).mean()

            if volume >= adaptive_threshold: # <--- Dùng ngưỡng tự động ở đây
                if not is_speaking:
                    print("🎤 Đang nghe...", flush=True)
                    is_speaking = True
                buffer.append(chunk)
                silence_count = 0
            else:
                if is_speaking:
                    buffer.append(chunk)
                    silence_count += 1

            # Kiểm tra điều kiện gửi: ngắt nghỉ hoặc đạt max
            if is_speaking and (silence_count >= SILENCE_CHUNKS or len(buffer) >= MAX_CHUNKS):
                audio_np = np.concatenate(buffer)
                duration = len(audio_np) / SAMPLE_RATE

                if duration >= MIN_RECORD_SECS:
                    print(f"📤 Gửi {duration:.1f}s audio → server (queue: {audio_queue.qsize()})")
                    await audio_queue.put(audio_np)

                # Thuật toán nối từ (Overlap Chunking)
                # Nếu bị cắt ngang do Max_Duration (chưa kịp ngừng nói) -> Giữ lại 0.5 giây cuối để làm đầu câu sau
                if silence_count < SILENCE_CHUNKS and duration >= MIN_RECORD_SECS:
                    overlap_frames = int(OVERLAP_SECS / SMALL_CHUNK_SECS)
                    buffer = buffer[-overlap_frames:]
                    is_speaking = True
                else:
                    buffer = []
                    is_speaking = False

                silence_count = 0

            # Nhường quyền cho event loop (quan trọng!)
            await asyncio.sleep(0)


async def tts_player(tts_queue: asyncio.Queue):
    """Một Task riêng biệt chuyên xếp hàng phát âm thanh, không bao giờ cắt ngang nhau"""
    while True:
        audio_data = await tts_queue.get()
        try:
            fd, temp_mp3 = tempfile.mkstemp(suffix=".mp3")
            with os.fdopen(fd, 'wb') as f:
                f.write(audio_data)

            # Chờ đến khi tiếng nói trước xong hoàn toàn mới phát cái tiếp theo
            while pygame.mixer.music.get_busy():
                await asyncio.sleep(0.1)

            pygame.mixer.music.load(temp_mp3)
            pygame.mixer.music.play()
            
            # Chờ file load/play một tẹo rồi mới bắt đầu chờ get_busy thực sự
            await asyncio.sleep(0.2)
            while pygame.mixer.music.get_busy():
                await asyncio.sleep(0.1)

            # Xóa file temp (cẩn thận vì pygame thỉnh thoảng lock file)
            try:
                pygame.mixer.music.unload()
                os.remove(temp_mp3)
            except:
                pass 
                
        except Exception as e:
            print(f"  ❌ Lỗi phát TTS: {e}")
        finally:
            tts_queue.task_done()


async def consumer(ws, audio_queue: asyncio.Queue, tts_queue: asyncio.Queue):
    """
    CONSUMER: Lấy audio từ queue, gửi lên server, nhận kết quả, đẩy vào tts_queue.
    """
    while True:
        audio_np = await audio_queue.get()
        duration = len(audio_np) / SAMPLE_RATE

        try:
            await ws.send(audio_np.tobytes())
            print(f"  ⏳ Đợi server xử lý {duration:.1f}s audio...")

            result = json.loads(await ws.recv())

            if not result.get("skipped"):
                vi_text = result.get('vi', '')
                en_text = result.get('en', '')
                if vi_text:
                    print(f"  [VI] {vi_text}")
                    print(f"  [EN] {en_text}")
                    print()

                    # Ghi ra file (append)
                    with open("input.txt", "a", encoding="utf-8") as f:
                        f.write(vi_text + "\n")
                    with open("output.txt", "a", encoding="utf-8") as f:
                        f.write(en_text + "\n")
                
                # Bỏ audio vào hàng đợi phát TTS
                audio_b64 = result.get('audio_b64')
                if audio_b64:
                    audio_data = base64.b64decode(audio_b64)
                    await tts_queue.put(audio_data)
                    print(f"  📥 Đã xếp hàng {len(audio_data)} bytes TTS audio")


            else:
                print("  🔇 Server bỏ qua (im lặng)")

            print("🔇 Chờ tiếng nói...\n")

        except (websockets.exceptions.ConnectionClosedError,
                websockets.exceptions.ConnectionClosedOK):
            print("⚠️  Mất kết nối server!")
            break
        except Exception as e:
            print(f"❌ Lỗi consumer: {e}")


async def main(device_id: int):
    """Khởi chạy cả Producer và Consumer song song"""
    # Xóa file cũ khi bắt đầu phiên mới
    for f in ["input.txt", "output.txt"]:
        if os.path.exists(f):
            os.remove(f)
    print("📝 Đã xóa input.txt & output.txt cũ")

    print(f"\n🔌 Kết nối tới {SERVER_URL}...")
    ws = await connect_with_retry()
    print(f"🎙️  Đang dùng: [{device_id}] {sd.query_devices(device_id)['name']}")
    print("⏹️  Nhấn Ctrl+C để dừng\n")

    audio_queue = asyncio.Queue(maxsize=10)
    tts_queue   = asyncio.Queue(maxsize=10)

    # Chạy song song: producer thu âm, consumer gửi/nhận, player phát tiếng
    producer_task = asyncio.create_task(producer(device_id, audio_queue))
    consumer_task = asyncio.create_task(consumer(ws, audio_queue, tts_queue))
    player_task   = asyncio.create_task(tts_player(tts_queue))

    # Dừng khi một trong các task dừng
    done, pending = await asyncio.wait(
        [producer_task, consumer_task],
        return_when=asyncio.FIRST_COMPLETED
    )
    for task in pending:
        task.cancel()
    player_task.cancel()


if __name__ == "__main__":
    try:
        device = select_device()
        asyncio.run(main(device))
    except KeyboardInterrupt:
        print("\n⏹️  Đã dừng.")