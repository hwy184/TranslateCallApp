# Mobile RN (Expo Dev Client)

React Native frontend V1 cho flow voice-room.

## 1) Cai dat

```bash
cd mobile-rn
npm install
```

`npm install` se tu dong setup Android env local (JDK/SDK path) cho may hien tai.

## 2) Env

Dat env khi chay:

```bash
set EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080
set EXPO_PUBLIC_LIVEKIT_URL=wss://<your-livekit-cloud>.livekit.cloud
```

Voi 2 may that trong cung LAN, dung IP LAN cua may chay backend:

```bash
set EXPO_PUBLIC_API_BASE_URL=http://192.168.x.y:8080
```

## 3) Android dev build

```bash
npm run android
npm run start
```

Neu qua may moi, quy trinh van nhu tren: chi can `npm install` roi `npm run android`.

Mo app tren 2 thiet bi:
- May A: tao room (Host)
- May B: join room (Guest)

## 4) Tinh nang da co

- Auth guest / registered
- Create room / join room / end room
- Join LiveKit bang token backend
- Data-channel `translation.events` timeline
- Local transcript foundation (AsyncStorage)
- History screen (local + cloud cho registered)
- Voice settings (local + cloud sync cho registered)

## 5) Luu y v1

- In-call language toggle dang an.
- Premium billing chua ap dung.
