# LinguaVoiceTranslation Planning (SRS v1.2 + Architecture v3)

## Source of Truth
- Functional source: `readme/Requirements/Software_Requirement_Specification_ver1.2.docx`.
- Technical source: `readme/Software Architecture Specifications-v3.docx`.
- Legacy references only: `readme/legacy/*` (do not overwrite, do not use as priority baseline).

## Document Priority Order
1. `Software_Requirement_Specification_ver1.2.docx`
2. `Software Architecture Specifications-v3.docx`
3. Earlier SRS/Charter/ConOps/Detail Design docs as historical context only

## MVP Scope (Current Implementation Target)
- Platform: Android-first React Native app.
- Access: Guest mode and Registered mode.
- Authentication: Email/password register/login, JWT session token.
- Room model: 1 Host + 1 Guest, room code 6 digits.
- Language: `vi <-> en` only.
- Core call: LiveKit room, realtime subtitle + translation + TTS path via worker.
- History:
  - Guest: local history capped at 10 conversations.
  - Registered: cloud history in PostgreSQL, list/detail/delete/sync.

## Architecture Alignment
- Client: `LinguaApp/LinguaApp` (Expo/React Native).
- Backend API: `backend-node`.
- AI Worker bridge: `worker-python` (FastAPI, LiveKit bridge, provider interface).
- Infra: `infra/docker-compose.yml`.
- Database: PostgreSQL with normalized tables for users/auth_sessions/rooms/participants/transcript_items.

## In-Scope / Out-of-Scope
### In Scope
- Home/Auth/Create/Join/Waiting/Call/History/Settings flows.
- Room lifecycle: create, resolve by code, join, status polling, end room.
- Call controls: mic toggle, speaker toggle, leave/end room, in-room language toggle.

### Out of Scope (Phase after MVP)
- OCR/image translation.
- Standalone text translation UI.
- GPS suggestions.
- Notification center features.
- Contact/search/social-call navigation features.
- Group call / offline mode / non-vi-en language expansion.

## AI Provider Direction
- Production path: Worker provider interfaces with Google-first profile strategy.
- Legacy local AI paths (e.g., Ollama-only demo path) are kept only as fallback/legacy reference, not primary MVP demo route.

## Current Refactor Direction
- Remove UI/UX and endpoints outside MVP scope.
- Keep compatibility with architecture constraints and clean service boundaries.
- Prefer stable APIs in `/api/v1/*` and explicit internal worker event endpoints.
