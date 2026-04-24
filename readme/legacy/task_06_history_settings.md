# Task 06 - History + Voice Settings API

## Muc tieu

Hoan thien 2 endpoint con thieu:
- `DELETE /history/{id}`
- `PUT /me/preferences/voice`

## Da lam

- Backend route:
  - Implement `DELETE /api/v1/history/{id}`
  - Implement `PUT /api/v1/me/preferences/voice`
  - Co validation payload/query ro rang bang Zod
  - Error code chuan hoa:
    - `HISTORY_NOT_FOUND`
    - `USER_NOT_FOUND`
    - `USER_NOT_REGISTERED`

- Persistence:
  - Them `deleteHistoryItem(id)`
  - Them `upsertVoicePreference({ userId, settings })`
  - Policy cloud sync:
    - chi cho `registered` user
    - `guest` se bi tu choi voi `403 USER_NOT_REGISTERED`

## Ghi chu policy

- `GET /history` + `DELETE /history/{id}` da lam viec tren cloud transcript table.
- Voice preferences cloud hien tai la per-user qua `voice_preferences.settings` (jsonb).
- Upsert voice preference da duoc chong race condition bang DB-side merge:
  - `ON CONFLICT ... DO UPDATE SET settings = voice_preferences.settings || EXCLUDED.settings`
- Endpoint dang dat ten `PUT` nhung hanh vi hien tai la partial merge (patch-like).
- Ap dung voice preference vao output TTS runtime se tiep tuc noi o task realtime integration sau.
