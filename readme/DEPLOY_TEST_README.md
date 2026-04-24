# LinguaVoiceTranslation - Hướng Dẫn Khởi Động Và Chạy Test

Tài liệu này dùng để bàn giao nhanh cho người khác chạy test bản MVP hiện tại.
Mục tiêu là bật được backend, worker, database và cho app mobile kết nối vào server để tạo phòng, vào phòng, gọi thử và kiểm tra dịch realtime.

## 1. Phạm vi tài liệu này

- Đây là hướng dẫn chạy test nội bộ tạm thời, chưa phải tài liệu deploy VPS production.
- Media realtime hiện dùng `LiveKit Cloud`.
- Server cục bộ gồm:
  - `backend-node`
  - `worker-python`
  - `postgres`
- Mobile app hiện đang mặc định gọi API qua:
  - `http://192.168.1.9:3000/api/v1`

Nếu máy host đổi mạng hoặc đổi IP LAN, phải cập nhật lại IP này trong app trước khi build lại.

## 2. Cấu trúc dự án cần biết

- App mobile: `F:\AI_local_model\LinguaApp\LinguaApp`
- Backend: `F:\AI_local_model\backend-node`
- Worker: `F:\AI_local_model\worker-python`
- Infra: `F:\AI_local_model\infra`

## 3. Điều kiện trước khi chạy

Máy host cần có:

- Docker Desktop đang chạy
- Android Studio / emulator nếu test bằng máy ảo
- Node.js và npm
- Expo CLI qua `npx expo`
- File secret Google service account:
  - `F:\AI_local_model\secrets\gcp-sa.json`

Biến môi trường local cần có:

- `backend-node/.env`
- `worker-python/.env` nếu có cấu hình riêng ngoài `.env.example`

Tối thiểu cần đúng các giá trị:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `GOOGLE_APPLICATION_CREDENTIALS`

## 4. Cách khởi động server

Mở PowerShell tại thư mục:

```powershell
cd F:\AI_local_model\infra
```

Khởi động toàn bộ stack:

```powershell
docker compose up -d --build
```

Kiểm tra trạng thái container:

```powershell
docker compose ps
```

Kỳ vọng:

- `voice_postgres` chạy và healthy
- `voice_worker` chạy và healthy
- `voice_backend` chạy và healthy

## 5. Kiểm tra health trước khi đưa tester vào

Kiểm tra backend:

```powershell
Invoke-RestMethod http://localhost:3000/health | ConvertTo-Json -Depth 6
```

Kiểm tra worker:

```powershell
Invoke-RestMethod http://localhost:8000/health | ConvertTo-Json -Depth 6
```

Kỳ vọng:

- backend trả `status: ok` hoặc `degraded` có lý do rõ
- worker trả `status: ok`
- worker có trường `active_sessions`

## 6. Cách chạy app mobile

Vào thư mục app:

```powershell
cd F:\AI_local_model\LinguaApp\LinguaApp
```

Chạy Android:

```powershell
npx expo run:android --device
```

Hoặc nếu dùng emulator:

```powershell
npx expo run:android
```

Lưu ý:

- App hiện mặc định trỏ API về `192.168.1.9`
- Nếu tester dùng điện thoại/tablet thật, thiết bị phải truy cập được IP LAN của máy host
- Nếu app giữ cache URL cũ, hãy gỡ app hoặc clear app data rồi cài lại

## 7. Luồng test cơ bản cho tester

1. Mở app trên 2 thiết bị
2. Một người đăng nhập hoặc vào với vai trò host
3. Tạo phòng
4. Sao chép mã phòng
5. Thiết bị còn lại nhập mã phòng để vào
6. Test 2 chiều:
   - host nói tiếng Việt
   - guest nói tiếng Anh
7. Kiểm tra:
   - người nghe chỉ nghe giọng AI đã dịch
   - người nói không nghe lại giọng AI của chính mình
   - timeline có text gốc và bản dịch
   - host end thì guest tự out
   - guest leave thì host vẫn ở lại được

## 8. Log cần xem khi có lỗi

Log backend:

```powershell
docker compose logs --tail=100 backend
```

Log worker:

```powershell
docker compose logs --tail=100 worker
```

Log postgres:

```powershell
docker compose logs --tail=100 postgres
```

Log frontend xem trực tiếp ở terminal `expo run:android`.

## 9. Lỗi thường gặp và cách xử lý nhanh

### 9.1 Request timeout trên tablet hoặc emulator

Nguyên nhân thường gặp:

- thiết bị không vào được `192.168.1.9`
- app đang giữ URL cũ trong local storage
- máy host đổi IP LAN nhưng app chưa rebuild
- backend chưa chạy

Cách xử lý:

1. Mở trình duyệt trên thiết bị thử:

```text
http://192.168.1.9:3000/health
```

2. Nếu không mở được:
   - kiểm tra host còn đúng IP `192.168.1.9` không
   - kiểm tra host và thiết bị có cùng mạng không
   - kiểm tra firewall Windows

3. Nếu điện thoại vào được nhưng tablet không vào được:
   - clear app data trên tablet
   - gỡ app và cài lại

### 9.2 Không nghe được âm thanh dịch

Kiểm tra:

- worker có log:
  - `livekit_bridge_stt_text`
  - `livekit_bridge_tts_pcm_ready`
  - `livekit_bridge_tts_published`
- frontend có đang vào đúng room không
- speaker trên máy có đang bật không

### 9.3 Người nói nghe lại bản dịch của chính mình

Bản hiện tại đã siết luồng để chỉ phát đúng track `translated_to_{localParticipant}`.
Nếu vẫn gặp:

1. rebuild app
2. clear app data
3. test lại trên 2 thiết bị
4. nếu vẫn lỗi, lấy log frontend + worker để rà tiếp track subscription

### 9.4 Worker không lên

Kiểm tra:

- file `secrets/gcp-sa.json` có tồn tại không
- `docker compose logs worker`
- `worker-python/.env` và `.env.example`

### 9.5 Backend lên nhưng app không login/create room được

Kiểm tra:

- `docker compose ps`
- backend `/health`
- database có healthy không
- `backend-node/.env`

## 10. Cách dừng hệ thống

Tại thư mục `F:\AI_local_model\infra`:

```powershell
docker compose down
```

Nếu chỉ muốn restart service:

```powershell
docker compose restart backend
docker compose restart worker
```

## 11. Checklist nhanh trước khi đưa người khác test

- [ ] Docker Desktop đang chạy
- [ ] `docker compose up -d --build` đã chạy xong
- [ ] `docker compose ps` cho thấy `backend`, `worker`, `postgres` đang chạy
- [ ] `http://localhost:3000/health` truy cập được
- [ ] `http://localhost:8000/health` truy cập được
- [ ] Máy host đang có IP LAN `192.168.1.9`
- [ ] App mobile là bản mới nhất
- [ ] Nếu tester bị timeout, đã thử clear app data hoặc cài lại app

## 12. Ghi chú hiện trạng

- Đây là cách chạy test nội bộ trong mạng LAN.
- Nếu muốn người ngoài mạng vẫn vào được mà không cần bật máy cá nhân, cần deploy lên VPS/public server.
- MVP hiện ưu tiên ổn định luồng demo và kiểm chứng realtime translation trước khi chuyển sang deploy internet public.
