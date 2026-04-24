# Lõi AI Local: Realtime VI-EN Translation Pipeline

## 1. Mục tiêu Dự án (Project Goal)
Xây dựng một hệ thống dịch thuật Giọng nói (Vietnamese) sang Giọng nói (English) theo thời gian thực (Real-time). Mục tiêu là đạt được tốc độ nhanh nhất (chờ < 2 giây), chất lượng âm học tốt, câu văn có ngữ cảnh, và hỗ trợ phát TTS tự động.

## 2. Công nghệ Cốt lõi (Tech Stack)
- **Speech-to-Text (Nghe):** Whisper `large-v3-turbo` (chạy qua package `whisper` local, `fp16=True`, `beam_size=5`). Đủ nhẹ và cực kỳ chính xác cho tiếng Việt.
- **LLM Translation (Dịch):** Ollama kích hoạt mô hình `gemma4:e4b` (hoạt động qua `/api/chat` để hỗ trợ System Prompt và Session History).
- **Text-to-Speech (Nói):** `edge-tts` (Sử dụng API của Microsoft Edge). Cực kỳ mượt, đọc chuẩn giọng bản xứ (ví dụ: `en-US-AriaNeural`), xuất ra file MP3 không ngốn VRAM.
- **Micro-Framework:** `FastAPI` với `WebSocket` để duy trì kết nối song công.

## 3. Cấu trúc Client (`client.py`)
- **Producer-Consumer Pattern:** Tách biệt hoàn toàn luồng thu âm (mic) và luồng gọi mạng. Thu âm đẩy vào `asyncio.Queue`, gửi mạng rút từ Queue. Tránh việc rớt chữ khi server đang bận dịch.
- **Smart VAD (Phát hiện giọng nói):** 
  - `SILENCE_SECS = 0.8`: Ngắt nếu im lặng > 0.8s (nghỉ nhịp tự nhiên).
  - `MAX_RECORD_SECS = 5.0`: Chặt cứng nếu câu nói dài hơn 5 giây để luôn đảm bảo tính realtime.
  - `MIN_RECORD_SECS = 1.2`: Bỏ qua các tiếng thở dốc, tặc lưỡi ngắn, tránh rác cho server.
- **Overlap Chunking (Gối đầu từ vựng):** Nếu bị chặt cứng bởi giới hạn 5s, sẽ lấy lại **0.5 giây cuối** của chunk đó làm mồi cho chunk tiếp theo -> Whisper không bao giờ bị nghe mất nửa từ.
- **Playback Audio:** Nhận Base64 Audio từ server, giải nén ra file Temp `.mp3` và đẩy vào `pygame.mixer` để phát tiếng Anh ngay lặp tức.

## 4. Cấu trúc Server (`main.py`)
- **Acoustic Context Injection:** Đưa 2 câu tiếng Việt dịch thành công gần nhất vào làm tham số `initial_prompt` cho model Whisper. Điều này giúp Whisper không bị lạc nhịp điệu của cả hệ văn bản.
- **Anti-Hallucination:** Whisper tiếng Việt dính 1 lỗi cực nặng là tự "sáng tác" các câu như *"Các bạn hãy đăng ký kênh để ủng hộ mình nhé"*. Cơ chế chặn triệt để: Lọc các cụm từ này thông qua danh sách Đen (`HALLUCINATION_BLACKLIST`) kết hợp `no_speech_prob > 0.5`.
- **Translation Context:** LLM Gemma4 thỉnh thoảng sẽ đánh rớt chữ nếu chỉ nhận 1 vế. Do đó, Context History của 3 câu gần nhất được nạp chung vào `messages` Chat API.

## 5. Kinh nghiệm Xương máu (Khắc phục Sự cố)
1. **Lỗi GPU TDR (VGA Bị chớp/Reset & Đóng băng CUDA):**
   - Sự cố này xuất hiện khi RAM/VRAM bị dồn dập (Whisper + MeloTTS/LLM tải cùng lúc) làm GPU bị quá thời gian Timeout chờ. Windows chớp đen màn hình.
   - Hậu quả: `import torch.cuda` sẽ treo vô tận (Infinite lock). Uvicorn không báo lỗi, chỉ đứng im.
   - Giải pháp duy nhất: Restart toàn bộ Máy Tính.
   - Biện pháp phòng tránh: Đã dỡ bỏ các bộ TTS quá nặng chạy local như MeloTTS, thay hoàn toàn bằng `edge-tts` gọi API, giảm thiểu áp lực VRAM.
2. **LLM Output rỗng (Empty String):** Gemma4 Instruction Model luôn từ chối trả lời nếu dùng `/api/generate` kiểu văn bản thô. Bắt buộc dùng môi trường `/api/chat` quy định rõ System Prompt đóng vai Translator.

## 6. Lộ trình Mở rộng tiếp theo (Cần ghi nhớ)
- Giải pháp AI Local (1 GPU RTX XX60) chỉ là Prototype. Server sẽ thắt cổ chai (bottleneck) và sụp đổ nếu lớn hơn 2-3 người dùng đồng thời do model phải tính toán tuần tự theo hàng đợi FIFO.
- Nếu muốn scale lên 50-200 CCU, dự án PHẢI thiết lập Server LiveKit (hoặc WebRTC) để làm luồng phân phối Audio chính. Phần back-end phải phân tán (Distributed Architecture) ra Cluster STT riêng biệt gắn Load Balancer, hoặc dùng API Cloud (như Deepgram Fast STT + Groq LLM) mới chịu được tải.
