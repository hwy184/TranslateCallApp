# Team ENV Setup (Internal)

Use [F:\AI_local_model\env.laptop.internal.example](F:\AI_local_model\env.laptop.internal.example) as the single source of truth.

## Quick flow

1. Copy `env.laptop.internal.example` to your laptop.
2. Fill real values for secrets (`LIVEKIT_*`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.).
3. Copy variables into the 3 runtime files:
   - `backend-node/.env`
   - `worker-python/.env`
   - `LinguaApp/LinguaApp/.env`

## Variable map table

| Variable | Put in file | Required | Note |
|---|---|---:|---|
| `LIVEKIT_URL` | `backend-node/.env`, `worker-python/.env` | Yes | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` | `backend-node/.env`, `worker-python/.env` | Yes | Secret, never commit |
| `LIVEKIT_API_SECRET` | `backend-node/.env`, `worker-python/.env` | Yes | Secret, never commit |
| `JWT_SECRET` | `backend-node/.env` | Yes | Use a long random string |
| `DATABASE_URL` | `backend-node/.env` | Yes | Postgres connection |
| `WORKER_INTERNAL_URL` | `backend-node/.env` | Yes | Usually `http://worker:8000` in Docker |
| `ROOM_LOCK_MINUTES` | `backend-node/.env` | Yes | `1` for test, `5` for demo |
| `BACKEND_EVENTS_URL` | `worker-python/.env` | Yes | Usually `http://backend:3000/api/v1/internal/worker/events` |
| `GOOGLE_APPLICATION_CREDENTIALS` | `worker-python/.env` | Yes* | Needed if using Google provider |
| `OPENAI_API_KEY` | `worker-python/.env` | Optional | Needed only when OpenAI provider used |
| `GEMINI_API_KEY` | `worker-python/.env` | Optional | Needed only when Gemini provider used |
| `EXPO_PUBLIC_SERVER_HOST` | `LinguaApp/LinguaApp/.env` | Recommended | Use hostname to avoid IP edits |
| `EXPO_PUBLIC_API_BASE_URL` | `LinguaApp/LinguaApp/.env` | Yes | Example: `http://192.168.1.9:3000/api/v1` |
| `EXPO_PUBLIC_LIVEKIT_URL` | `LinguaApp/LinguaApp/.env` | Optional | Leave empty, app can fetch from backend config |

## Recommended values for internal team testing

| Scenario | Value |
|---|---|
| Test quickly, save LiveKit quota | `ROOM_LOCK_MINUTES=1` |
| Demo run | `ROOM_LOCK_MINUTES=5` |
| Mobile config stable | Set `EXPO_PUBLIC_SERVER_HOST` to machine hostname |

## Security checklist before pushing GitHub

1. Do not commit real values in any `.env` file.
2. Keep only placeholders in `.env.example` files.
3. If a key was exposed once, rotate/revoke it before sharing repo.
4. Run a quick scan:

```powershell
git grep -n -I -E "AIza|sk-[A-Za-z0-9]|LIVEKIT_API_SECRET|OPENAI_API_KEY|GEMINI_API_KEY"
```
