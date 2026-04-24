# LinguaVoiceTranslation Demo & Metrics Checklist

Tài liệu này dùng cho buổi demo và để trả lời các câu hỏi về chất lượng sản phẩm.
Nó bám theo planning hiện tại: MVP chỉ giữ `Tiếng Việt <-> English`, 1 host + 1 guest, no custom server URL trong UI.

## 1) Mục tiêu demo

- Cho thấy người nói chỉ nghe giọng gốc của mình, còn bên kia nghe giọng AI đã dịch.
- Cho thấy room code luôn nhìn thấy/copy được để vào lại khi rớt kết nối.
- Cho thấy guest leave không đóng nhầm room, host end thì guest tự thoát.
- Cho thấy history của guest và registered chạy đúng nhánh riêng.
- Cho thấy fallback: backend/worker/LiveKit/STT/TTS lỗi thì app vẫn báo rõ.

## 2) Bộ câu test

### Short utterances
- "Xin chào."
- "Bạn khỏe không?"
- "Tôi tên là Minh."
- "Yes."
- "Please wait."
- "Thank you."

### Medium utterances
- "Xin chào, tôi muốn kiểm tra ứng dụng dịch thời gian thực."
- "Bạn có thể nói chậm hơn một chút được không?"
- "Hôm nay tôi sẽ thử đổi ngôn ngữ giữa tiếng Việt và tiếng Anh."
- "Please tell me your name and where you are from."

### Long utterances
- "Giờ tôi sẽ nói một câu dài hơn để kiểm tra xem hệ thống có bị cắt giữa câu hay không, ví dụ như tôi là Nguyễn Bùi Nhật Huy và tôi muốn biết bạn có nghe rõ không."
- "This is a longer English sentence to verify that the translated audio keeps playing through the whole utterance without cutting off midway."

## 3) Cách chạy demo

1. Host đăng nhập và tạo room.
2. Host copy room code và mở màn chờ.
3. Guest nhập room code, join room, xác nhận room state.
4. Host nói 2-3 câu ngắn.
5. Guest nói 1 câu dài.
6. Host đổi ngôn ngữ trong phòng.
7. Guest leave.
8. Host end room.

## 4) Metrics cần lấy

### Realtime latency
- Nguồn đo: log worker `room_pipeline_utterance_timed`.
- Chỉ số:
  - `stt_ms`
  - `translate_ms`
  - `tts_ms`
  - `total_ms`
- Mục tiêu:
  - `p95 total_ms <= 5000`
  - nếu xấu hơn, ghi rõ stage nào chậm nhất.

### Audio quality
- Kiểm tra:
  - segment accepted/dropped
  - `stt_empty`
  - `tts_ready` / `tts_failed`
  - không có auto-mute cắt giữa câu
- Mục tiêu:
  - 10 câu test liên tiếp không bị nghe lặp giọng gốc ở phía người nghe
  - câu dài không bị ngắt giữa chừng

### Translation quality
- Soi theo transcript:
  - nghĩa giữ được
  - xưng hô tự nhiên
  - không đảo nghĩa quan trọng
- Chấm theo batch 50-100 câu:
  - pass nếu khoảng 90% câu giữ nghĩa đúng mức demo

### History correctness
- Guest:
  - local only
  - tối đa 10 cuộc
- Registered:
  - cloud sync sau cuộc gọi
  - mở lại vẫn thấy lịch sử

## 5) Log / đối chiếu nhanh

### Worker
- `livekit_bridge_vad_config`
- `livekit_bridge_vad_segment_accepted`
- `livekit_bridge_stt_text`
- `room_pipeline_utterance_timed`
- `livekit_bridge_tts_pcm_ready`
- `livekit_bridge_tts_published`

### Backend
- `/health` trả rõ `db` và `worker`
- `join room` trả `worker_session.state`
- `leave room` của guest không stop worker sai

### Frontend
- Banner health trên Home
- Room code panel trong call
- Notice nếu worker start fail nhưng room vẫn chạy
- Timeline hiển thị transcript và dịch

## 6) Pass / Fail checklist

- [ ] Host tạo room thành công
- [ ] Guest join bằng room code thành công
- [ ] Room code copy được
- [ ] Guest leave không đóng room sai
- [ ] Host end làm guest tự thoát
- [ ] Người nghe chỉ nghe TTS đã dịch
- [ ] Câu dài không bị cắt giữa chừng
- [ ] Guest local history chỉ giữ 10 cuộc
- [ ] Registered cloud history đồng bộ được
- [ ] `/health` báo degraded khi backend/worker có vấn đề
- [ ] Không cần nhập API Base URL hoặc LiveKit URL trong UI cuối

## 7) Ghi chú khi bị hỏi

- Nếu STT lỗi: app bỏ segment đó và nghe tiếp câu sau.
- Nếu Translate lỗi: giữ transcript gốc và báo bản dịch tạm thời lỗi.
- Nếu TTS lỗi: vẫn giữ text dịch, chỉ thiếu audio AI.
- Nếu backend/worker lỗi: app báo degraded, không crash luồng call.
- Nếu mạng chập chờn: giữ room code để vào lại.
