# Task 09 - LiveKit Cloud Data Bridge (Worker Join + DataChannel Publish)

## Muc tieu

Nang cap LiveKit bridge tu hook scaffold thanh che do room-connect that cho LiveKit Cloud.

## Da lam

- Worker `LiveKitBridge`:
  - Tao JWT worker identity tu `LIVEKIT_API_KEY/SECRET`
  - Join room hidden participant qua `livekit.rtc.Room.connect`
  - Luu session -> room context de publish event
  - Tao/publish translated audio output tracks theo target identity:
    - `translated_to_<participant_identity>`
  - Subscribe remote audio tracks (`track_subscribed`) va bat audio observer loop
  - Disconnect room khi stop session/shutdown
  - File: `worker-python/app/services/livekit_bridge.py`

- Session event routing:
  - Day du target_identity trong event details de co the route destination identity
  - LiveKit bridge publish event payload len data channel topic `translation.events`
  - Co `destination_identities` neu event co `details.target_identity`
  - `translation.final` co audio publish path vao translated track (hien tai tone placeholder)
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

- Task nay da kich hoat media-plane path nen:
  - join room + data channel publish
  - translated audio track publish (placeholder tone)
  - remote audio subscribe observer
- Buoc tiep theo: thay placeholder tone bang PCM TTS output thuc te va noi STT-from-audio collector.
