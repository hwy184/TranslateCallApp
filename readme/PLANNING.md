# LinguaVoiceTranslation Planning - Hoàn thiện MVP

## Mục tiêu hiện tại
Đưa sản phẩm từ trạng thái "đã có luồng chính" sang trạng thái "demo được, đo được, có fallback". Tài liệu này là kế hoạch triển khai tiếp theo, không thay thế SRS v1.2 hay Architecture v3.

Baseline cũ đã được lưu tại `readme/legacy/PLANNING_mvp_baseline_srs_v1_2_arch_v3.md`.

## Source of Truth
- Functional source: `readme/Requirements/Software_Requirement_Specification_ver1.2.docx`.
- Technical source: `readme/Software Architecture Specifications-v3.docx`.
- Product context: `readme/Project Charter/Project_Charter_Lingua_v1.0.docx` và `readme/ConOps/Concept of Operations.docx`.
- Legacy references: `readme/legacy/*`.

## MVP phải giữ đúng
- Android-first React Native app.
- Guest mode và Registered mode.
- Room 1 Host + 1 Guest, room code 6 digits.
- Ngôn ngữ MVP: `Tiếng Việt <-> English` only.
- Core call: LiveKit room, realtime subtitle + translation + TTS qua worker.
- Guest history: local-only, capped 10 conversations.
- Registered history: cloud history in PostgreSQL, list/detail/delete/sync.
- Không expose API base URL hoặc LiveKit URL trong UI người dùng cuối.

## Ưu tiên triển khai
### P0 - Demo critical path phải ổn định
- Realtime audio/TTS playback: người nghe chỉ nghe giọng AI dịch, người nói không nghe lại bản TTS của chính mình.
- VAD/STT stability: giảm segment quá ngắn, giảm `stt_empty`, không cắt TTS giữa câu.
- Room lifecycle: host end thì guest tự out; guest leave thì host chỉ nhận thông báo, room và worker không bị stop sai.
- Room code visibility: trong cuộc gọi vẫn thấy/copy được mã phòng để vào lại khi rớt kết nối.
- URL/server config hidden: app dùng cấu hình build/server, không yêu cầu người dùng nhập URL kỹ thuật.

### P1 - Đúng requirement và đủ tin cậy
- History: guest local max 10, registered cloud history hoạt động sau cuộc gọi thật.
- Language setting: chỉ giữ `Tiếng Việt` và `English`, setting phải ảnh hưởng tới create/join/call hoặc được ghi rõ là display-only nếu chưa dùng.
- UI tiếng Việt có dấu trên các màn MVP.
- Fallback/degraded mode rõ ràng cho backend, LiveKit, worker, STT, Translate, TTS, DB.

### P2 - Polish trước demo
- Làm UI/UX bớt trống, ưu tiên Home, Create/Join, Call, History, Settings.
- Cleanup route hoặc màn không còn thuộc MVP chính.
- Chuẩn bị demo script và checklist đo chất lượng.

## Quality gates
- AI translation latency: từ lúc kết thúc câu nói tới lúc bên kia bắt đầu nhận TTS, `p95 <= 5s`.
- LiveKit media latency: target `<500ms` theo Architecture v3.
- TTS publish success rate: `>=95%` cho câu đã có translated text.
- STT empty rate: `<5%` với utterance dài `>=1s` trong môi trường yên tĩnh.
- Translation meaning accuracy: khoảng `90%` trên bộ test 50-100 câu Việt/Anh.
- Room critical path: tạo phòng, copy mã, guest join, bắt đầu dịch không cần nhập URL thủ công.
- History correctness: guest không sync cloud; registered list/detail/delete/sync pass.

## Critical path fallback
- Backend down: app báo lỗi thân thiện, không tạo/join phòng mới; health endpoint báo degraded.
- LiveKit down hoặc token thiếu: không vào call mù, giữ trạng thái phòng/mã phòng và cho thử lại.
- Worker start fail: room không nên mất; UI báo dịch tự động tạm thời không khả dụng và cho retry.
- STT fail: bỏ segment lỗi, tiếp tục nghe câu sau, log event để debug.
- Translate fail: giữ transcript gốc, báo bản dịch tạm thời lỗi.
- TTS fail: vẫn hiển thị text dịch, chỉ tắt âm thanh AI cho câu đó.
- Network unstable: LiveKit reconnect, UI giữ room code và trạng thái đang kết nối lại.
- Guest leave: host được báo, room không đóng.
- Host end: room đóng, worker stop, guest nhận trạng thái đóng và tự thoát.
- DB unavailable: guest local history vẫn dùng; registered cloud history tạm báo chưa sync.
