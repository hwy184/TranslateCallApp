# Task 10 - Mobile FE (React Native V1 Core Voice Call)

## Muc tieu

Khoi tao app mobile React Native theo huong 1 app / 2 role (Host + Guest), Android-first, dung Expo Dev Client va LiveKit realtime call.

## Da lam

- Tao project `mobile-rn/` voi:
  - Expo + TypeScript + React Navigation
  - Zustand session store + AsyncStorage persistence
  - API client + backend error mapping theo `error.code`

- Auth + Room orchestration:
  - `Guest Quick Start` (`POST /auth/guest`)
  - `Registered Login` (`POST /auth/login`)
  - Host create room (`POST /rooms`)
  - Guest join room (`POST /rooms/join`)
  - Luu room/session context de vao call screen

- Realtime call screen:
  - Connect LiveKit bang token backend tra ve
  - Xin quyen mic Android, bat/tat mic
  - Subscribe data channel `translation.events`
  - Parse va render timeline cho:
    - `subtitle.final`
    - `translation.final`
    - `warning`
    - `error`
    - `participant.state`
  - Filter translated audio tracks theo quy uoc:
    - chi nhan `translated_to_<local_identity>`
  - Host leave => `POST /rooms/{roomId}/end`
  - Guest leave => disconnect only

- Local transcript foundation:
  - Append event vao local storage theo `session_id`
  - Co API doc/list transcript local de su dung cho history phase

- Phase B UI foundation:
  - History screen:
    - Guest: local transcript
    - Registered: local + cloud history (`GET /history`)
  - Voice settings screen:
    - Local save cho tat ca
    - Registered sync cloud (`PUT /me/preferences/voice`)
    - Guest local-only
  - Premium gate tam bo qua theo quyet dinh hien tai

- In-call language toggle:
  - Dang an trong v1 (chua co runtime sync settings backend->worker)

## Test assets

- Unit tests:
  - `__tests__/errors.test.ts`
  - `__tests__/events.test.ts`
  - `__tests__/session-state.test.ts`

## Ghi chu van hanh

- Can cai dependencies trong `mobile-rn/` truoc khi chay test/build:
  - `npm install`
  - `npm run android`
  - `npm run start`
