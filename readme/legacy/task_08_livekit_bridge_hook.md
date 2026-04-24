# Task 08 - LiveKit Bridge Hook (Lifecycle + Event Path)

## Muc tieu

Tao cau noi runtime de worker co the gan LiveKit media-plane ma khong pha vo luong session hien tai.

## Da lam

- Worker:
  - Them `LiveKitBridge` service:
    - `worker-python/app/services/livekit_bridge.py`
  - Session manager ho tro hooks:
    - `on_session_start`
    - `on_session_stop`
  - Event sink ket hop (backend events + livekit bridge) chay song song:
    - `worker-python/app/main.py`
  - StartSessionRequest nhan them `livekit` block:
    - `worker-python/app/sessions/models.py`
  - RoomPipelineSession luu them `livekit` metadata:
    - `worker-python/app/sessions/room_pipeline_session.py`

- Backend:
  - payload start worker bo sung block `livekit`:
    - `backend-node/src/services/worker-client.ts`
  - route join tao `worker_identity` theo session id va gui xuong worker:
    - `backend-node/src/routes/v1.route.ts`

## Ket qua

- Worker da co lifecycle bridge hook de gan LiveKit true transport o buoc tiep theo.
- Luong event backend va luong bridge LiveKit co the chay dong thoi, khong chan session pipeline.
- Chua thay doi media-plane (track subscribe/publish) trong task nay; day la buoc dat nen runtime.
