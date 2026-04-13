# Task 07 - Realtime Foundation (Room Metadata + Participant Routing)

## Muc tieu

Chuan hoa du lieu room/participant giua Backend -> Worker de mo duong cho LiveKit realtime integration.

## Da lam

- Backend khi start worker session da gui them:
  - `room_metadata`:
    - `mode=bidirectional`
    - `audio_mode=translated_only`
    - `supported_languages`
    - `provider_profile`
  - `participants`:
    - `role`, `identity`
    - `source_language`, `target_language`
    - `voice_profile`
  - File: `backend-node/src/services/worker-client.ts`

- Route `POST /rooms/join`:
  - pre-check room state
  - lay host participant settings tu DB
  - goi worker start mot lan duy nhat voi participant metadata day du
  - File: `backend-node/src/routes/v1.route.ts`

- Worker StartSessionRequest:
  - nhan `room_metadata` + `participants`
  - File: `worker-python/app/sessions/models.py`

- Worker RoomPipelineSession:
  - luu participant map theo `identity`
  - auto-resolve target identity neu request khong gui `target_identity`
  - auto-resolve source/target language va voice profile tu participant metadata
  - emit `participant.state` events luc session start
  - File: `worker-python/app/sessions/room_pipeline_session.py`

## Ket qua

- Worker khong con phu thuoc viec client phai truyen day du moi truong moi utterance.
- Context key van giu theo `(speaker_identity, target_identity)`.
- Dat nen dung contract metadata de gan media transport LiveKit o buoc tiep theo.
