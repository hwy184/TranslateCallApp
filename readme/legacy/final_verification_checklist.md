# Final Verification Checklist (V1)

## 1) Pre-flight

- [ ] `docker compose up --build --force-recreate -d` thanh cong.
- [ ] `GET /health` cua backend tra `status=ok`.
- [ ] `GET /health` cua worker tra `status=ok`.
- [ ] Worker co nhan env LiveKit:
  - [ ] `LIVEKIT_BRIDGE_ENABLED=true`
  - [ ] `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` khong rong.

## 2) Room Lifecycle

- [ ] `POST /api/v1/auth/guest` thanh cong.
- [ ] `POST /api/v1/rooms` tao room `status=waiting_guest`.
- [ ] `POST /api/v1/rooms/join` thanh cong:
  - [ ] room `status=active`
  - [ ] `worker_session.state=started`
  - [ ] `worker_session.participants=2`
- [ ] `POST /api/v1/rooms/{roomId}/end`:
  - [ ] room `status=ended`
  - [ ] API van `200` ngay ca khi stop worker warning (best effort).

## 3) Translation Flow (Bidirectional)

- [ ] Simulate host utterance (VI -> EN):
  - [ ] `subtitle.final` co `source_lang=vi`, `target_lang=en`
  - [ ] `translation.final` co `translated_text`
- [ ] Simulate guest utterance (EN -> VI):
  - [ ] `subtitle.final` co `source_lang=en`, `target_lang=vi`
  - [ ] `translation.final` co `translated_text`

## 4) Event Contracts

- [ ] Worker events duoc backend chap nhan theo schema.
- [ ] `translation.final` bat buoc `translated_text`.
- [ ] `session.state` / `participant.state` khong can utterance fields.
- [ ] `warning` va `error` co detail phuc vu debug.

## 5) Persistence

- [ ] `GET /api/v1/history?session_id=...` co du:
  - [ ] `subtitle.final`
  - [ ] `translation.final`
- [ ] `DELETE /api/v1/history/{id}` xoa duoc item.
- [ ] `PUT /api/v1/me/preferences/voice`:
  - [ ] registered user: `200`
  - [ ] guest user: `403 USER_NOT_REGISTERED`

## 6) Fallback Behavior

- [ ] STT fallback: inject fail marker primary, secondary van chay.
- [ ] Translate fallback: inject fail marker primary, secondary van chay.
- [ ] TTS fail toan chain:
  - [ ] van co `translation.final`
  - [ ] co `warning` event.

## 7) LiveKit Bridge

- [ ] Worker join room voi identity `ai_worker_*`.
- [ ] Worker publish data channel event topic `translation.events`.
- [ ] Co translated audio track theo target identity:
  - [ ] `translated_to_<participant_identity>`

## 8) Stability / Ops

- [ ] Khong crash khi gui 10-20 utterances lien tiep.
- [ ] Restart worker, backend van tao session moi duoc.
- [ ] Logs co du thong tin de trace session:
  - [ ] session_id
  - [ ] room_id
  - [ ] event type / error detail

## 9) NFR Baseline (Manual)

- [ ] Do latency utterance -> `translation.final` trung binh.
- [ ] Kiem tra xu huong CPU/RAM backend-worker trong 15-30 phut.
- [ ] Chua thay memory leak ro rang o worker event bridge / backend history path.

### Lenh baseline de xai lai

```bash
python readme/nfr_baseline.py --rooms 20 --concurrency 10
python readme/nfr_baseline.py --rooms 50 --concurrency 20
```

### Muc tieu baseline goi y (noi bo)

- `success_rate >= 95%`
- `sim_host_ms p95 <= 5000`
- `sim_guest_ms p95 <= 5000`
- khong co loi crash service hang loat trong qua trinh run.

## 10) Sign-off

- [ ] Functional pass.
- [ ] Persistence pass.
- [ ] LiveKit bridge pass.
- [ ] Team chap nhan cho V1 internal release.
