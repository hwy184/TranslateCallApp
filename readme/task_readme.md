# Danh sách Công việc (Tasks Handoff)

Tài liệu tiếp quản dành cho AI bắt tay vào triển khai dự án **LiveKit Voice Pipeline Translator**.

## To-Do List (Giai đoạn Triển khai AI)

### 1. Chuẩn bị (Setup)
- [x] Tổ chức mã nguồn: tạo cấu trúc thư mục mới có `plugins/`.
- [x] Soạn file `requirements.txt` cập nhật (cần: `livekit-agents`, `edge-tts`, `openai`, `pydub`/`av` cho decode audio...).
- [x] Đảm bảo hiểu rõ bản chất của file cũ `AI_handoff_context.md` và `main.py` để kéo các hàm có ích (như danh sách từ bị cấm - hallucination blacklist, prompt, vv) sang kiến trúc mới.

### 2. Viết Custom LiveKit Plugins (Cốt Lõi)
Cần thiết kế 3 plugin độc lập (Adapter) làm Sub-class kế thừa các Base class từ `livekit.agents`.
- [x] **`plugins/stt/whisper.py`**:
    - Build class kế thừa `livekit.agents.stt.STT` và `stt.SpeechStream`.
    - Thêm cơ chế nhận biết chunk và chặn các Hallucinations đã đề cập trong planning.
    - Cấu hình ngôn ngữ nghe phụ thuộc tham số khởi tạo.
- [x] **`plugins/llm/ollama.py`**:
    - Dùng trực tiếp wrapper của LLM Livekit hoặc viết lớp kế thừa Interface LLM, trỏ `base_url` về `localhost:11434/v1` (Ollama chuẩn OpenAI).
    - Tạo cơ chế Dynamic Prompts (Dịch từ Source X -> Target Y).
- [x] **`plugins/tts/edge_tts.py`**:
    - Build class kế thừa `tts.TTS`.
    - Xử lý mấu chốt kỹ thuật: Nhận `stream` từ edge-tts -> Giải mã nén (MP3 -> Raw PCM Mono 24/48kHz) -> Yield về dạng đối tượng `AudioFrame` hợp lệ của LiveKit.

### 3. Ráp nối Core Logic (File `pipeline.py`)
- [x] Sử dụng `silero.VAD.load()` cho phát hiện giọng nói.
- [x] Lệnh định nghĩa `AgentServer` và `@server.rtc_session`.
- [x] Gắn kết STT, LLM, TTS vào đối tượng `VoicePipelineAgent` (hoặc cấu hình kiểu `AgentSession`).
- [x] Xử lý Event bắt **Room Metadata** (để setup Source, Target Language lúc Client mới connect).
- [x] Đăng ký Event Channel để bắn (Publish) text nhận diện tiếng nguồn (STT text) và text đích (LLM text) qua DataChannel cho FE.

### 4. Triển khai Google Colab
- [x] Tạo file Notebook `run_colab.ipynb` hướng dẫn và cung cấp bash script để setup Cuda, clone Repo, gắn `ngrok` (nếu cần), cài thư viện và run agent.
