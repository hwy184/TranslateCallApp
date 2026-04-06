# Kế hoạch & Tầm nhìn Kiến trúc (Voice Pipeline Agent)

Tài liệu này dùng để tóm tắt bối cảnh và định hướng thiết kế mới để chuyển giao (Handoff) cho phiên AI tiếp theo. Nhiệm vụ là chuyển đổi một mã nguồn Python WebSocket gốc (thu âm thủ công) sang nền tảng **LiveKit Agents SDK**.

## 1. Mục tiêu (Goals)
- Xây dựng Voice Translator thời gian thực chạy cục bộ (chuyển ngữ tự động).
- Thiết kế Agent Server tương thích với giao thức WebRTC của LiveKit.
- Triển khai miễn phí, giảm tải máy cá nhân bằng cách chạy Agent Server (chứa các model AI nặng như Whisper, LLM) trên GPU T4 của Google Colab và tận dụng LiveKit Cloud (như là server định tuyến WebRTC).

## 2. Kiến Trúc Mới (Architecture & Pattern)
Định hướng mới của hệ thống tuân thủ chặt nguyên tắc **S.O.L.I.D** với kiến trúc **Event-Driven Micro-components Pipeline**. Các lớp pattern được áp dụng:

- **Strategy Pattern:** Lắp đặt các engine AI tùy ý thông qua giao diện `STT`, `LLM`, `TTS` được định nghĩa bởi thư viện LiveKit.
- **Adapter Pattern:** Đóng gói các model cục bộ không theo chuẩn (như Edge-TTS) thành lớp tương thích với chuẩn `rtc.AudioFrame` của LiveKit. 
    *Ví dụ: LiveKit đòi Raw PCM Audio, nhưng Edge-TTS nhả file nén MP3. Adapter sẽ chặn ở giữa để thực hiện Decode (Bằng pydub hoặc av).*
- **Observer Pattern:** Quan sát các biến cố (khi WebRTC bắt đầu có âm thanh, người nói dứt câu, khi LLM dịch xong đoạn đầu tiên, v.v) thông qua Signal Event, để gửi Text qua lại.

## 2.1 Cấu trúc Thư mục (Modular Folders)
Để đảm bảo nguyên tắc **S.O.L.I.D** (Đặc biệt là Single Responsibility), mã nguồn được chia nhỏ theo chức năng:
- `plugins/stt/`: Chứa các bộ chuyển giọng nói thành văn bản.
- `plugins/llm/`: Chứa các bộ não AI thực hiện dịch thuật.
- `plugins/tts/`: Chứa các bộ chuyển văn bản thành giọng nói.
- `utils/`: Chứa các bộ giải mã âm thanh (Audio Decoder) hoặc các hàm lọc văn bản độc lập.
Mỗi file chỉ đảm nhiệm một vai trò duy nhất, không ghép quá nhiều logic vào cùng một file.

## 3. Quản lý Trạng Thái và Ngữ Cảnh (Context & State)
- **Cấu hình Ngôn Ngữ**: Không dùng AI để "Auto-Detect" mù mờ để tránh lỗi định hướng dịch. Sẽ do Frontend (Web/App) gán `{"source": "vi", "target": "en"}` qua `Room_Metadata` lúc Guest connect vào phòng. Backend sẽ dựa vào JSON đó setup lại Prompt cho Ollama & Config ngôn ngữ gốc cho Whisper.
- **Lọc Ảo Giác (Anti-Hallucination)**: Whisper model hay "tự đẻ" chữ rác vào khoảng trống (VD: "ủng hộ kênh Youtube"). Plugin STT tự chế bắt buộc phải có bước chèn Blacklist lọc chuỗi trước khi Emit ra Text chính thức.  
- **Vận Chuyển Text (Real-time Messaging)**: Sử dụng luồng **DataChannel** của LiveKit (`publish_data`) để truyền Transcript của Whisper và Translation Text trả về Frontend.

## 4. Danh sách các Model AI (đề xuất)
- **STT**: `whisper large-v3-turbo` (chạy qua package `whisper` local, device 'cuda'). Đã bao gồm khả năng chống ảo giác bằng thuật toán gạt im lặng & check blacklist.
- **LLM**: `Ollama (Gemma4:e4b)`. Nạp Role Translation linh hoạt theo Metadata.
- **TTS**: API `edge-tts` (Aria Neural, v.v.). Nhẹ, không tốn VRAM, giọng tự nhiên, cần code Adapter để stream luồng nén về luồng WebRTC.
- **VAD**: Sử dụng VAD Silero được bọc sẵn trong `livekit.plugins.silero`.

## 5. Quy trình thực hiện (Process)
Để đảm bảo tính ổn định và khả năng phục hồi, dự án tuân thủ quy trình:
1. **Báo cáo task**: Giải trình chi tiết task tiếp theo.
2. **Thực hiện task**: Viết code, đảm bảo SOLID và đơn nhiệm.
3. **Commit Git**: Mỗi khi hoàn thành một task thành công, phải thực hiện git commit để lưu lại trạng thái ổn định, phòng trường hợp cần Rollback.
