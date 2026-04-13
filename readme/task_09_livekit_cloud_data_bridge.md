# Task 09 - LiveKit Cloud Data Bridge (Worker Join + DataChannel Publish)

## Muc tieu

Nang cap LiveKit bridge tu hook scaffold thanh che do room-connect that cho LiveKit Cloud.

## Da lam

- Worker `LiveKitBridge`:
  - Tao JWT worker identity tu `LIVEKIT_API_KEY/SECRET`
  - Join room hidden participant qua `livekit.rtc.Room.connect`
  - Luu session -> room context de publish event
  - Disconnect room khi stop session/shutdown
  - File: `worker-python/app/services/livekit_bridge.py`

- Session event routing:
  - Day du target_identity trong event details de co the route destination identity
  - LiveKit bridge publish event payload len data channel topic `translation.events`
  - Co `destination_identities` neu event co `details.target_identity`
  - File: `worker-python/app/sessions/room_pipeline_session.py`

- Session lifecycle cleanup:
  - `SessionManager.close()` stop active sessions va goi hook stop bridge
  - File: `worker-python/app/sessions/manager.py`

## Cau hinh

- Bat bridge:
  - `LIVEKIT_BRIDGE_ENABLED=true`
- Credentials cloud:
  - `LIVEKIT_URL`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
- Optional:
  - `LIVEKIT_WORKER_IDENTITY_PREFIX`

## Ghi chu

- Task nay tap trung data-channel bridge + room join lifecycle.
- Media audio track subscribe/publish (RTP audio collector + translated audio track) se tiep tuc o buoc media-plane integration tiep theo.
