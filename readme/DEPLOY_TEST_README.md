# LinguaVoiceTranslation - Deploy/Test Guide

Tai lieu nay huong dan khoi dong stack local, public backend qua ngrok, va ket noi app mobile.

## 1. Pham vi

- Muc tieu: chay demo/test MVP on dinh.
- Khong phai tai lieu production hardening day du.
- Media realtime dung LiveKit Cloud.

## 2. Cau truc chinh

- Backend: `F:\AI_local_model\backend-node`
- Worker: `F:\AI_local_model\worker-python`
- Infra: `F:\AI_local_model\infra`
- Mobile app: `F:\AI_local_model\LinguaApp\LinguaApp`

## 3. Dieu kien truoc khi chay

- Docker Desktop dang chay.
- Node.js + npm da cai.
- Android Studio/emulator hoac thiet bi that.
- File secret Google ton tai: `F:\AI_local_model\secrets\gcp-sa.json`.

Can co cac file env:

- `backend-node/.env`
- `worker-python/.env` (neu can override `.env.example`)
- `LinguaApp/LinguaApp/.env`

## 4. Cau hinh backend `.env` toi thieu

```env
NODE_ENV=production
TRUST_PROXY_HOPS=1
CORS_ALLOWED_ORIGINS=https://<your-ngrok-domain>
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_ROOMS_MAX=60
RATE_LIMIT_GLOBAL_MAX=120
PORT=8080

LIVEKIT_URL=wss://<livekit-host>
LIVEKIT_API_KEY=<livekit-key>
LIVEKIT_API_SECRET=<livekit-secret>

JWT_SECRET=<strong-random-secret>
WORKER_INTERNAL_SECRET=<strong-random-secret>

WORKER_INTERNAL_URL=http://127.0.0.1:8090
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/voice_translation
```

Luu y:

- `CORS_ALLOWED_ORIGINS` phai dung origin frontend/public URL ban dang goi API.
- Khong commit secret that vao git.

## 5. Khoi dong server

```powershell
cd F:\AI_local_model\infra
docker compose up -d --build
```

Kiem tra:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:3000/health | ConvertTo-Json -Depth 6
Invoke-RestMethod http://localhost:8000/health | ConvertTo-Json -Depth 6
```

Ky vong: backend/worker/postgres healthy.

## 6. Public backend bang ngrok

### 6.1 Cai va auth ngrok (1 lan)

```powershell
ngrok config add-authtoken <YOUR_TOKEN>
```

### 6.2 Mo tunnel den backend host port 3000

```powershell
ngrok http 3000
```

Lay URL HTTPS duoc cap, vi du:

`https://xxxx.ngrok-free.dev`

### 6.3 Kiem tra tunnel

```powershell
Invoke-WebRequest https://xxxx.ngrok-free.dev/health
Invoke-WebRequest https://xxxx.ngrok-free.dev/api/v1/client/config
```

Neu `200 OK` + JSON thi tunnel OK.

## 7. Cau hinh mobile app `.env`

File: `LinguaApp/LinguaApp/.env`

```env
EXPO_PUBLIC_API_BASE_URL=https://xxxx.ngrok-free.dev/api/v1
EXPO_PUBLIC_LIVEKIT_URL=
```

`EXPO_PUBLIC_LIVEKIT_URL` de trong de app lay dong tu backend `/api/v1/client/config`.

## 8. Build/chay app Android

```powershell
cd F:\AI_local_model\LinguaApp\LinguaApp
npx expo start -c
npx expo run:android --device
```

Neu app da luu URL cu, go app khoi may roi cai lai.

## 9. Troubleshooting nhanh

### 9.1 App bao khong ket noi duoc backend

- Xac nhan backend local OK: `http://localhost:3000/health`.
- Xac nhan ngrok forward dung port `3000` (khong phai `8080`).
- Xac nhan app dung dung `EXPO_PUBLIC_API_BASE_URL`.
- Xoa app/cache va build lai (`npx expo start -c`).

### 9.2 Trinh duyet hien `Cannot GET /api/v1`

- Binh thuong, vi `/api/v1` khong co route GET root.
- Test dung endpoint:
  - `/health`
  - `/api/v1/client/config`

### 9.3 Ngrok URL thay doi sau moi lan chay

- Cap nhat lai:
  - `LinguaApp/LinguaApp/.env`
  - `backend-node/.env` (`CORS_ALLOWED_ORIGINS`)
- Restart backend va rebuild app.

## 10. Dung stack

```powershell
cd F:\AI_local_model\infra
docker compose down
```

Hoac restart rieng:

```powershell
docker compose restart backend
docker compose restart worker
```
