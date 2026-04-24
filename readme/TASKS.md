# LinguaVoiceTranslation Tasks - Hoàn thiện MVP

Status key: `TODO` | `IN_PROGRESS` | `DONE`

## T0 - Documentation Refresh (`DONE`)
Subtasks:
- [x] Archive baseline planning cũ sang `readme/legacy/PLANNING_mvp_baseline_srs_v1_2_arch_v3.md`.
- [x] Rewrite `readme/PLANNING.md` thành kế hoạch hoàn thiện MVP.
- [x] Rewrite `readme/TASKS.md` thành backlog triển khai tiếp theo.

Acceptance criteria:
- Planning cũ được bảo toàn trong `readme/legacy`.
- Planning mới nêu rõ P0/P1/P2, quality gates và critical path fallback.
- Tasks mới có checklist đo được cho giai đoạn tiếp theo.

## T1 - Room Lifecycle Hardening (`IN_PROGRESS`)
Subtasks:
- [x] Host end room: backend đóng room, stop worker, guest nhận trạng thái đóng và tự thoát.
- [x] Guest leave room: host được báo, room không bị đóng sai, worker không bị stop sai nếu host vẫn ở lại.
- [x] Room code luôn hiển thị/copy được trong màn call.
- [x] Khi reconnect hoặc vào lại, người dùng không bị mất mã phòng cần thiết.
- [ ] Verify end-to-end trên 2 thiết bị thật: host end, guest leave, reconnect/vào lại bằng mã phòng.

Acceptance criteria:
- Host kết thúc cuộc gọi thì guest tự out trong UI.
- Guest rời phòng thì host vẫn ở lại phòng và có thể chờ guest vào lại.
- Worker chỉ stop khi room thật sự closed hoặc không còn cần dịch.

## T2 - Realtime Audio/TTS Reliability (`IN_PROGRESS`)
Subtasks:
- [ ] Verify audio route: người nghe chỉ nghe TTS dịch, người nói không nghe lại TTS của chính mình.
- [x] Tune VAD để giảm segment quá ngắn và giảm `stt_empty`.
- [x] Không publish TTS bị cắt giữa câu; câu dài vẫn phát đủ.
- [x] Log đủ mốc: segment accepted, STT text, translation done, TTS ready, TTS published.
- [x] Rebuild/restart worker container để VAD config mới có hiệu lực.
- [ ] Verify 10 câu test Việt/Anh trên thiết bị thật.

Acceptance criteria:
- Với 10 câu test Việt/Anh, timeline có source text, translated text và bên kia nghe được TTS.
- AI translation latency đạt `p95 <= 5s` trong môi trường demo.
- TTS publish success rate đạt `>=95%` trên câu có translated text.
- STT empty rate `<5%` với utterance dài `>=1s` trong phòng yên tĩnh.

## T3 - Fallback & Degraded Mode (`IN_PROGRESS`)
Subtasks:
- [ ] Backend down: UI hiển thị lỗi thân thiện khi create/join fail.
- [ ] LiveKit token/connection fail: giữ trạng thái và cho thử lại, không yêu cầu nhập URL kỹ thuật.
- [x] Worker start fail: room không mất; UI báo dịch tự động tạm thời không khả dụng.
- [x] STT/Translate/TTS fail: degrade theo mức text gốc, text dịch, hoặc không có âm thanh cho câu đó.
- [x] DB unavailable: guest local history vẫn dùng được; registered cloud history báo chưa sync.
- [ ] Verify từng failure mode bằng thao tác thật hoặc container/service stop có kiểm soát.

Acceptance criteria:
- Mỗi failure mode có message người dùng hiểu được và log kỹ thuật đủ để debug.
- Critical path không crash app khi một service phụ trợ lỗi.
- Health/degraded state có thể dùng để giải thích trong demo.

## T4 - History Verification (`IN_PROGRESS`)
Subtasks:
- [x] Guest history local-only và capped 10 conversations.
- [x] Registered history lưu cloud sau cuộc gọi thật.
- [x] Registered list/detail/delete/delete-all hoạt động với PostgreSQL.
- [x] Nếu có local-to-cloud sync, UI thể hiện trạng thái sync rõ.
- [ ] Verify end-to-end bằng 1 cuộc guest và 1 cuộc registered trên app thật.

Acceptance criteria:
- Guest không gửi history lên cloud.
- Guest chỉ giữ 10 cuộc mới nhất.
- Registered login lại vẫn thấy cloud history.
- Delete single và delete all phản ánh đúng trong UI/backend.

## T5 - Language & Settings Consistency (`IN_PROGRESS`)
Subtasks:
- [x] Chỉ giữ `Tiếng Việt` và `English` trong UI MVP.
- [ ] Language setting được dùng làm mặc định cho create/join/call hoặc ghi rõ là chỉ áp dụng trong call.
- [ ] In-room language switch không làm hỏng segment đang xử lý.
- [x] Toàn bộ label chính dùng tiếng Việt có dấu.

Acceptance criteria:
- Không còn ngôn ngữ ngoài Việt/Anh trong luồng MVP.
- Người dùng đổi ngôn ngữ và câu tiếp theo dùng đúng hướng dịch.
- Không có label kỹ thuật như API URL/LiveKit URL trong UI người dùng cuối.

## T6 - UI/UX Polish (`IN_PROGRESS`)
Subtasks:
- [x] Home có mục đích rõ: tạo phòng, vào phòng, xem lịch sử, trạng thái tài khoản.
- [x] Create/Join ít bước, không trống trải, không có label vô nghĩa.
- [x] Call screen có room code, trạng thái kết nối, mic/speaker/end rõ ràng.
- [x] History phân biệt rõ danh sách cuộc gọi và chi tiết transcript.
- [ ] Cleanup màn hoặc route không còn thuộc MVP chính.

Acceptance criteria:
- Người dùng mới biết phải làm gì trong 5 giây đầu.
- Text không vỡ dòng xấu trên điện thoại thật.
- Main navigation chỉ phục vụ MVP: Trang chủ và Lịch sử, các flow khác đi từ CTA phù hợp.

## T7 - Quality Measurement & Demo Checklist (`IN_PROGRESS`)
Subtasks:
- [x] Tạo `readme/DEMO_AND_METRICS_CHECKLIST.md` cho demo và đo chất lượng.
- [x] Chuẩn bị bộ 50-100 câu test Việt/Anh để chấm meaning accuracy.
- [x] Chuẩn bị script demo: host create, guest join, nói 3 câu ngắn, 1 câu dài, đổi hướng ngôn ngữ, guest leave, host end.
- [x] Ghi cách đo latency từ log worker/backend/frontend.
- [x] Ghi checklist pass/fail trước buổi demo.

Acceptance criteria:
- Translation meaning accuracy đạt khoảng `90%` trên test set.
- Demo script có thể chạy lại nhất quán.
- Log có đủ dữ liệu tính p50/p95 latency.

## T8 - Infra/Secrets/Deployment Readiness (`DONE`)
Subtasks:
- [x] Đảm bảo app lấy server config từ build/deployment config, không từ input người dùng.
- [x] `.env.example` chỉ dùng placeholder, không chứa secret thật.
- [x] Compose healthchecks cho backend/worker/postgres hoạt động.
- [x] Worker verification không bị chặn bởi quyền ghi `__pycache__`.
- [x] Rebuild container và xác nhận worker health endpoint respond trong container mode.

Acceptance criteria:
- `docker compose config` hợp lệ.
- Backend build pass.
- Worker health endpoint respond trong container mode.
- Không expose secret hoặc URL kỹ thuật trong UI demo.
