# LinguaVoiceTranslation MVP Test Cases

Tài liệu này dùng để kiểm chứng giai đoạn hoàn thiện MVP. Mục tiêu không phải viết thêm scope mới, mà là biến các mục trong `PLANNING.md` và `TASKS.md` thành testcase có thể chạy lại, đo được, và dùng được trong buổi demo.

## 1) Phạm vi kiểm thử

- MVP chỉ kiểm thử `Tiếng Việt <-> English`.
- Một phòng chỉ có `1 host + 1 guest`.
- Room code là mã 6 chữ số, luôn phải nhìn thấy và copy được trong màn gọi.
- Guest dùng local history, giới hạn 10 cuộc gần nhất.
- Registered user dùng cloud history.
- UI người dùng cuối không hiển thị API Base URL, LiveKit URL, hoặc cấu hình kỹ thuật tương tự.

## 2) Điều kiện trước khi test

- Backend, worker, postgres, LiveKit credentials đã cấu hình qua `.env` hoặc deployment config, không nhập tay trong UI.
- Worker health endpoint trả `status=ok` và có `active_sessions`.
- Backend health trả rõ trạng thái database và worker.
- Có 2 thiết bị/emulator đóng vai trò host và guest.
- Cả 2 thiết bị đã cấp quyền microphone.
- Môi trường test yên tĩnh khi đo STT/VAD.

## 3) Quy ước kết quả

Status: `PASS` | `FAIL` | `BLOCKED` | `NOT_RUN`

Evidence nên ghi:
- Ngày test, build/version, thiết bị host/guest.
- Ảnh màn hình nếu UI sai.
- Log worker/backend/frontend liên quan.
- Với audio: ghi rõ ai nói, ai nghe, có nghe lặp giọng gốc hay không.

## 4) Test Cases Chức Năng

| ID | Area | Preconditions | Steps | Expected result | Evidence |
| --- | --- | --- | --- | --- | --- |
| TC-00 | Infra health | Docker compose/deployment đã chạy | Kiểm tra backend `/health`, worker `/health`, compose/service status | Backend và worker healthy hoặc degraded có lý do rõ; worker trả `active_sessions` | Health response, service status |
| TC-01 | Host create room | Host đã đăng nhập | Host tạo phòng từ Trang chủ | Tạo room thành công, hiển thị mã 6 số, có nút copy, không yêu cầu nhập URL kỹ thuật | Screenshot room code |
| TC-02 | Guest join room | Host đang ở phòng | Guest nhập mã phòng và join | Guest vào đúng phòng; host thấy guest connected; worker session chạy hoặc UI báo degraded nếu worker lỗi | Frontend log, worker log |
| TC-03 | Audio host -> guest | Host và guest đã join | Host nói 5 câu tiếng Việt ngắn/trung bình | Guest nghe giọng AI tiếng Anh; host không nghe lại TTS của chính mình; timeline có gốc và dịch | Worker `stt_text`, `tts_published`; audio note |
| TC-04 | Audio guest -> host | Host và guest đã join | Guest nói 5 câu tiếng Anh ngắn/trung bình | Host nghe giọng AI tiếng Việt; guest không nghe lại TTS của chính mình | Worker log, audio note |
| TC-05 | Long utterance no cut | Host và guest đã join | Nói 2 câu dài trong bộ test | TTS phát đủ câu, không bị ngắt giữa chừng, timeline không tạo nhiều bản dịch rời vô nghĩa | Audio note, `tts_pcm_ready`, `tts_published` |
| TC-06 | VAD/STT empty rate | Phòng yên tĩnh | Chạy 20 câu dài >=1s, đếm `stt_empty` | `stt_empty rate < 5%`; segment quá ngắn không gây spam dịch | Count log |
| TC-07 | Latency p95 | Worker có log timing | Chạy ít nhất 30 câu, lấy `room_pipeline_utterance_timed.total_ms` | `p95 total_ms <= 5000`; nếu fail phải chỉ ra stage chậm nhất | Bảng p50/p95 |
| TC-08 | Guest leave lifecycle | Cả 2 đang ở phòng | Guest bấm rời phòng | Host được báo guest rời; host không bị out; worker không bị stop sai nếu host vẫn chờ | UI host, worker log |
| TC-09 | Guest rejoin | TC-08 đã chạy | Guest dùng lại mã phòng để vào lại | Guest vào lại được; room code vẫn còn; dịch tiếp tục hoạt động | UI, LiveKit log |
| TC-10 | Host end lifecycle | Cả 2 đang ở phòng | Host bấm kết thúc phòng | Room closed; guest nhận thông báo và tự thoát; worker stop best-effort | UI guest, backend/worker log |
| TC-11 | Worker start fail fallback | Có thể tạm stop worker | Tạm dừng worker rồi tạo/join room | App không crash; room vẫn vào được hoặc báo dịch tự động tạm thời không khả dụng; không mất room code | UI notice, backend response |
| TC-12 | Backend down fallback | Có thể tạm stop backend | Stop backend rồi create/join | UI báo lỗi thân thiện và cho thử lại; không hiện stack trace/URL kỹ thuật | Screenshot error |
| TC-13 | LiveKit fail fallback | Dùng sai token hoặc tắt network | Thử create/join/call khi LiveKit không kết nối | UI giữ trạng thái rõ, cho retry; không kẹt ở loading vô hạn | UI, frontend log |
| TC-14 | DB unavailable fallback | Có thể tạm stop postgres | Registered thực hiện cuộc gọi rồi leave | App không crash; cloud history báo chưa sync hoặc degraded; guest local history không bị ảnh hưởng | Backend health, UI history |
| TC-15 | STT/Translate/TTS fail degrade | Có thể mô phỏng lỗi provider | Làm từng provider fail trong 1 câu | STT fail bỏ segment; Translate fail giữ text gốc và báo lỗi; TTS fail vẫn giữ text dịch nhưng không có audio | Worker event details |
| TC-16 | Guest local history cap | Guest chưa đăng nhập | Tạo 12 cuộc gọi guest có transcript | Chỉ giữ 10 cuộc mới nhất local; không gọi cloud history sync cho guest | Local history list |
| TC-17 | Registered cloud history | User đã đăng nhập | Gọi, rời phòng, đăng xuất/đăng nhập lại | History vẫn có trên cloud; mở detail thấy transcript | Backend DB/API evidence |
| TC-18 | History delete single/all | Có history | Xóa 1 cuộc, sau đó xóa tất cả | UI và backend/local storage phản ánh đúng | Screenshot before/after |
| TC-19 | Language switch in call | Cả 2 đang ở phòng | Đổi hướng Việt/Anh trong phòng rồi nói câu tiếp theo | Câu đang xử lý không hỏng; câu tiếp theo dùng đúng hướng dịch | Timeline, audio note |
| TC-20 | Language setting default | Có màn setting | Chọn Tiếng Việt hoặc English làm mặc định, tạo/join phòng | Mặc định được áp dụng hoặc UI ghi rõ chỉ áp dụng trong call | Screenshot setting/call |
| TC-21 | Navigation MVP | App bản demo | Kiểm tra main navigation | Chỉ giữ Trang chủ và Lịch sử trong nav chính; các flow khác đi từ CTA phù hợp | Screenshot nav |
| TC-22 | UI text on real phone | Thiết bị thật màn nhỏ | Mở login/home/call/history | Chữ tiếng Việt có dấu, không vỡ dòng xấu, không lộ API/LiveKit URL | Screenshot real phone |
| TC-23 | Mic permission denied | App chưa cấp quyền mic | Từ chối quyền microphone rồi tạo/join | UI báo cần quyền mic bằng tiếng Việt dễ hiểu; không crash | Screenshot permission |
| TC-24 | Network unstable/reconnect | Cả 2 đang gọi | Tắt/bật mạng một thiết bị | Room code vẫn nhìn thấy; có thể vào lại; UI không kẹt sai trạng thái | Timeline reconnect |

## 5) Quality Gates

| Metric | Target | Cách đo | Test liên quan |
| --- | --- | --- | --- |
| AI latency | `p95 <= 5s` | Log `room_pipeline_utterance_timed.total_ms` | TC-07 |
| LiveKit media latency | `<500ms` mục tiêu demo | Quan sát audio end-to-end và log LiveKit nếu có | TC-03, TC-04 |
| TTS publish success | `>=95%` trên câu có translated text | `tts_published / tts_ready` hoặc event details | TC-03, TC-04, TC-05 |
| STT empty rate | `<5%` với câu >=1s | `stt_empty / total accepted segments` | TC-06 |
| Translation meaning accuracy | `~90%` giữ đúng nghĩa | Chấm bộ câu ở mục 6 theo pass/fail meaning | TC-25 |
| Guest history cap | `<=10` cuộc local | Đếm local history sau 12 cuộc | TC-16 |

## 6) Bộ Câu Chấm Meaning Accuracy

Chấm theo nghĩa, không bắt buộc câu dịch giống từng chữ. Mỗi câu đạt nếu người nghe hiểu đúng ý chính, không đảo nghĩa quan trọng, không mất thông tin định danh/số lượng quan trọng.

| ID | Direction | Source | Expected meaning |
| --- | --- | --- | --- |
| VI-01 | vi -> en | Xin chào, bạn nghe rõ tôi không? | Greeting and asks if the listener can hear clearly |
| VI-02 | vi -> en | Tôi tên là Nguyễn Bùi Nhật Huy. | Speaker says their name is Nguyen Bui Nhat Huy |
| VI-03 | vi -> en | Hôm nay tôi muốn kiểm tra tính năng dịch thời gian thực. | Speaker wants to test real-time translation today |
| VI-04 | vi -> en | Bạn có thể nói chậm hơn một chút được không? | Asks the listener to speak a little slower |
| VI-05 | vi -> en | Tôi đang dùng điện thoại để tham gia cuộc gọi. | Speaker is using a phone to join the call |
| VI-06 | vi -> en | Mã phòng của tôi là sáu chữ số. | The room code has six digits |
| VI-07 | vi -> en | Nếu bạn rời phòng, tôi vẫn sẽ ở lại chờ bạn. | If the listener leaves, speaker will stay and wait |
| VI-08 | vi -> en | Khi chủ phòng kết thúc cuộc gọi, khách sẽ tự thoát ra. | When host ends the call, guest exits automatically |
| VI-09 | vi -> en | Tôi không muốn nghe lại giọng AI ở phía của mình. | Speaker does not want to hear AI voice on their side |
| VI-10 | vi -> en | Người bên kia chỉ nên nghe bản dịch bằng giọng AI. | The other person should only hear AI translated speech |
| VI-11 | vi -> en | Câu này dùng để kiểm tra xem âm thanh có bị cắt giữa chừng không. | This sentence checks whether audio is cut midway |
| VI-12 | vi -> en | Lịch sử của khách chỉ lưu trên máy và tối đa mười cuộc. | Guest history is local only and capped at ten calls |
| VI-13 | vi -> en | Tài khoản đã đăng ký có thể xem lại lịch sử trên đám mây. | Registered account can view cloud history |
| VI-14 | vi -> en | Nếu mạng yếu, tôi cần thấy mã phòng để vào lại. | If network is unstable, speaker needs room code to rejoin |
| VI-15 | vi -> en | Nếu dịch văn bản thành công nhưng TTS lỗi, ứng dụng vẫn phải hiện bản dịch. | If text translation succeeds but TTS fails, app should still show translation |
| VI-16 | vi -> en | Tôi sẽ nói một câu dài hơn để kiểm tra độ trễ và độ ổn định của hệ thống trong buổi demo. | Longer sentence to test latency and stability during demo |
| VI-17 | vi -> en | Bạn có thể xác nhận rằng bạn chỉ nghe tiếng Anh không? | Asks listener to confirm they only hear English |
| VI-18 | vi -> en | Tôi vừa đổi ngôn ngữ, câu tiếp theo cần dịch đúng chiều mới. | After language switch, next sentence should use new direction |
| VI-19 | vi -> en | Nếu cơ sở dữ liệu tạm thời lỗi, ứng dụng không được bị thoát đột ngột. | If database temporarily fails, app must not crash |
| VI-20 | vi -> en | Màn hình chính cần cho tôi tạo phòng và xem lịch sử thật nhanh. | Home screen should let speaker create room and view history quickly |
| VI-21 | vi -> en | Tôi muốn sao chép mã phòng để gửi cho người tham gia. | Speaker wants to copy room code to send to participant |
| VI-22 | vi -> en | Tôi sẽ rời phòng với vai trò khách, chủ phòng vẫn nên ở lại. | Speaker leaves as guest; host should remain |
| VI-23 | vi -> en | Tôi sẽ kết thúc phòng với vai trò chủ phòng. | Speaker will end room as host |
| VI-24 | vi -> en | Bản dịch cần giữ đúng ý, không cần giống từng chữ. | Translation should preserve meaning, not word-for-word |
| VI-25 | vi -> en | Đây là câu cuối trong bộ kiểm thử tiếng Việt sang tiếng Anh. | This is the final Vietnamese-to-English test sentence |
| EN-01 | en -> vi | Hello, can you hear me clearly? | Chào và hỏi người nghe có nghe rõ không |
| EN-02 | en -> vi | My name is Nguyen Bui Nhat Huy. | Người nói tên là Nguyễn Bùi Nhật Huy |
| EN-03 | en -> vi | I want to test the real-time translation feature today. | Muốn kiểm tra tính năng dịch thời gian thực hôm nay |
| EN-04 | en -> vi | Could you speak a little more slowly? | Nhờ người nghe nói chậm hơn một chút |
| EN-05 | en -> vi | I am joining this call from my phone. | Đang tham gia cuộc gọi bằng điện thoại |
| EN-06 | en -> vi | The room code should stay visible during the call. | Mã phòng cần luôn hiển thị trong cuộc gọi |
| EN-07 | en -> vi | If I leave as a guest, the host should stay in the room. | Nếu khách rời thì host vẫn ở lại phòng |
| EN-08 | en -> vi | If the host ends the call, the guest should be sent back automatically. | Host kết thúc thì guest tự thoát/quay lại |
| EN-09 | en -> vi | I should not hear the translated AI voice on my own device. | Người nói không nên nghe giọng AI dịch trên máy mình |
| EN-10 | en -> vi | The other participant should hear only the translated AI voice. | Bên kia chỉ nên nghe giọng AI đã dịch |
| EN-11 | en -> vi | This sentence checks whether the translated audio is cut off in the middle. | Kiểm tra âm thanh dịch có bị cắt giữa chừng không |
| EN-12 | en -> vi | Guest history should stay local and keep only the latest ten calls. | Lịch sử guest lưu local và chỉ giữ 10 cuộc mới nhất |
| EN-13 | en -> vi | Registered users should see their history after logging in again. | User đăng ký đăng nhập lại vẫn thấy lịch sử |
| EN-14 | en -> vi | If the network is unstable, I need the room code to rejoin. | Mạng yếu thì cần mã phòng để vào lại |
| EN-15 | en -> vi | If text translation succeeds but TTS fails, the translation should still appear. | Nếu dịch text thành công nhưng TTS lỗi, vẫn hiện bản dịch |
| EN-16 | en -> vi | This is a longer sentence for testing latency and stability during the demo. | Câu dài hơn để kiểm tra độ trễ và ổn định khi demo |
| EN-17 | en -> vi | Please confirm that you only hear Vietnamese on your side. | Yêu cầu xác nhận bên kia chỉ nghe tiếng Việt |
| EN-18 | en -> vi | I just changed the language direction, so the next sentence should use the new direction. | Vừa đổi chiều ngôn ngữ, câu tiếp theo phải dùng chiều mới |
| EN-19 | en -> vi | If the database is temporarily unavailable, the app should not crash. | Database tạm lỗi thì app không được crash |
| EN-20 | en -> vi | The home screen should make the main actions clear within five seconds. | Màn hình chính phải rõ hành động chính trong 5 giây |
| EN-21 | en -> vi | I want to copy the room code and send it to another person. | Muốn copy mã phòng gửi cho người khác |
| EN-22 | en -> vi | I will leave the room as the guest. | Sẽ rời phòng với vai trò khách |
| EN-23 | en -> vi | I will end the room as the host. | Sẽ kết thúc phòng với vai trò host |
| EN-24 | en -> vi | The translation should preserve the meaning, not every exact word. | Bản dịch cần giữ nghĩa, không cần từng chữ |
| EN-25 | en -> vi | This is the final English-to-Vietnamese test sentence. | Đây là câu cuối trong bộ kiểm thử Anh sang Việt |

## 7) Test Case Chấm Accuracy

| ID | Area | Steps | Expected result | Pass rule |
| --- | --- | --- | --- | --- |
| TC-25 | Translation meaning accuracy | Chạy đủ 50 câu ở mục 6, lưu source/translated text, chấm từng câu pass/fail theo nghĩa | Dịch đúng ý chính, giữ thông tin quan trọng, không đảo nghĩa | Pass nếu ít nhất 45/50 câu đạt |

## 8) Mẫu Biên Bản Test

```text
Ngày test:
Build/version:
Host device:
Guest device:
Network:
Tester:

TC chạy:
PASS:
FAIL:
BLOCKED:

Latency:
- p50 total_ms:
- p95 total_ms:
- stage chậm nhất:

Audio:
- Có nghe lặp giọng gốc không:
- Có TTS bị cắt giữa câu không:
- TTS publish success:
- STT empty rate:

History:
- Guest local cap 10:
- Registered cloud sync:

Ghi chú lỗi cần sửa:
```

## 9) Điều kiện Đóng MVP

- P0 pass: TC-01 đến TC-15 không còn lỗi nghiêm trọng.
- UI/UX pass: TC-21, TC-22 không còn lỗi gây khó dùng trong demo.
- History pass: TC-16 đến TC-18 đúng theo guest/registered.
- Quality pass: TC-06, TC-07, TC-25 đạt target.
- Nếu một external provider lỗi trong lúc demo, app phải rơi vào degraded mode có thông báo rõ, không crash và không làm mất room code.
