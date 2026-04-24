# Voice Translation Pipeline Plan (V1)

## 1. Summary
- Muc tieu v1: hoan chinh luong hoi thoai giong noi 2 chieu `VI <-> EN` cho `2 nguoi dung + 1 AI worker an` trong mot LiveKit room.
- Pipeline co dinh: `AudioCollector -> VAD -> STT -> Translate(context) -> TTS -> AudioPublisher`.
- Kien truc thong nhat: `Mobile Client -> Node.js Backend API -> LiveKit Cloud -> Python AI Worker -> PostgreSQL`.
- Chien luoc AI: `cloud-first, pluggable` (production uu tien cloud, nhung giu contract de cam provider local).
- Voice-room la flow uu tien so 1; text translation/OCR dung chung provider registry, history schema, settings policy.

## 2. Scope Va Muc Tieu Ky Thuat
- Hoan thien full product flow lien quan voice-room: guest/registered user, create/join/end room, language select/toggle, translated audio, subtitle, transcript/history, settings, room cleanup, observability.
- Room model: moi room co `1 Host + 1 Guest + 1 AI Worker`.
- Audio mode mac dinh: `translated-audio only`.
- NFR muc tieu:
- AI translation stream latency (tu luc ket thuc utterance den luc nghe TTS) `<= 5s` trong dieu kien chuan.
- Ho tro quy mo toi thieu `200 users / 100 rooms`.

## 3. Kien Truc Tong The
- **Backend (Node.js/Express)**:
- Auth guest/registered, issue JWT va LiveKit token.
- Quan ly room lifecycle: create/join/end.
- Luu participant metadata, room metadata.
- Trigger AI Worker start/stop.
- Phat session events va cleanup khi room ket thuc.
- **AI Worker (Python/FastAPI)**:
- Quan ly `RoomPipelineSession` theo room.
- Join room nhu hidden participant.
- Subscribe audio tracks cua 2 nguoi.
- Tach queue theo speaker_identity.
- Xu ly pipeline va publish audio/subtitle.
- **LiveKit Cloud**:
- Relay media plane (WebRTC), room metadata, participant metadata, data channel.
- **PostgreSQL**:
- Luu users, rooms, participants, translations, session metadata, voice preferences.

## 4. Pipeline Chi Tiet
- **Stage 1 - AudioCollector**
- Buffer RTP audio frames theo participant.
- Gan `speaker_identity`, `room_id`, timestamp.
- **Stage 2 - VAD (Silero)**
- Cat silence, flush utterance theo boundary.
- Language toggle chi co hieu luc o utterance tiep theo sau khi VAD flush.
- **Stage 3 - STT**
- Nhan `language_hint` tu participant metadata.
- Provider fallback theo policy.
- **Stage 4 - Translate(context)**
- Dung context theo huong dich, key: `(speaker_identity, target_identity)`.
- Giu 3-5 utterances finalized gan nhat.
- Reset context khi room end; khong reuse context giua room.
- **Stage 5 - TTS**
- Synthesize theo voice profile cua nguoi nghe.
- Neu TTS loi: van gui subtitle + warning event.
- **Stage 6 - AudioPublisher**
- Publish translated audio track dung target participant.
- Track naming: `translated_to_<participant_identity>`.
- Gui bilingual subtitle JSON qua WebRTC Data Channel.

## 5. Provider Registry Va Fallback
- Chuan hoa interfaces:
- `VADProvider`
- `STTProvider`
- `TranslateProvider`
- `TTSProvider`
- Profile mac dinh production:
- `silero + google_stt + openai_translate + google_tts`
- Profile dev/fallback:
- `silero + whisper_local + ollama_translate + edge_tts`
- Fallback policy theo tung stage:
- Primary cloud -> secondary provider -> local provider (neu enabled).
- STT/Translate fail sau retry limit: danh dau utterance failed, session van song.

## 6. Public APIs / Interfaces
- `POST /auth/guest`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /rooms`
- `POST /rooms/join`
- `POST /rooms/{roomId}/end`
- `PATCH /rooms/{roomId}/participants/{participantId}/settings`
- `GET /history`
- `DELETE /history/{id}`
- `PUT /me/preferences/voice`
- `POST /translate/text`
- Internal contracts:
- `POST /internal/worker/sessions/start`
- `POST /internal/worker/sessions/{sessionId}/stop`
- `POST /internal/worker/events`

## 7. Metadata Va Data Channel Contract
- **LiveKit room metadata** bat buoc:
- `session_id`
- `mode=bidirectional`
- `audio_mode=translated_only`
- `supported_languages`
- `provider_profile`
- **Participant metadata** bat buoc:
- `role`
- `identity`
- `source_language`
- `target_language`
- `voice_profile`
- **Data channel events**:
- `subtitle.partial`
- `subtitle.final`
- `translation.final`
- `session.state`
- `participant.state`
- `warning`
- `error`
- **Payload fields bat buoc**:
- `session_id`, `room_id`, `utterance_id`, timestamps
- `speaker_identity`, `source_lang`, `target_lang`

## 8. Persistence, History, Settings
- Transcript text duoc broadcast lien tuc qua data channel.
- Khi room end:
- Ca 2 thiet bi auto-save transcript local.
- Registered user co tuy chon sync transcript text/metadata len cloud.
- Raw audio va TTS files chi luu local.
- Voice settings (speed/gender/profile) ap dung cho cac TTS outputs tiep theo.

## 9. Test Plan
- **Room lifecycle**
- Host tao room, Guest join, AI auto-join, room cleanup dung khi mot ben roi.
- **Bidirectional flow**
- Host noi VI -> Guest nghe EN; Guest noi EN -> Host nghe VI.
- Moi ben chi subscribe translated track danh cho chinh minh.
- **Context behavior**
- Dung context de xu ly pronoun/ellipsis o utterance sau.
- Context khong bi bleed giua rooms.
- **Language toggle**
- Toggle khi dang goi chi anh huong utterance tiep theo sau VAD boundary.
- **Provider behavior**
- Primary cloud ok.
- Quota/timeout thi fallback dung thu tu.
- TTS fail van co subtitle.
- STT/Translate fail khong lam chet room.
- **History & settings**
- Guest auto-save local.
- Registered user sync cloud theo policy.
- Voice settings ap dung cho output tiep theo.
- **Realtime/NFR**
- E2E translation latency `<= 5s` trong dieu kien chuan.
- Load test `200 users / 100 rooms`.
- Reconnect ngan khong crash session.

## 10. Assumptions
- V1 khoa ngon ngu o `VI <-> EN`, nhung contracts mo rong duoc cho multi-language phase sau.
- V1 dung LiveKit Cloud; van giu abstraction de co the self-host sau nay.
- Topology mac dinh: 1 VPS chay Docker Compose cho Backend, Worker, PostgreSQL.
- Audio mode mac dinh `translated only`; co the mo rong thanh user-selectable mode o phase sau.
- Neu SRS/SDS mau thuan ve history: uu tien `auto-save local transcript` khi room end va cloud sync chi danh cho registered user theo setting.

## 11. Handoff Strategy
- Chuyen Python PoC hien co thanh nen AI Worker service.
- WebSocket prototype cu duoc giu o sandbox/reference, khong la duong chay chinh.
- Tach Backend Node.js thanh service moi, dung chung contracts, env config va integration tests cua he thong thong nhat.
