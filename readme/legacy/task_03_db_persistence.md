# Task 03 - DB Schema + Persistence

## Muc tieu

Chuyen backend tu in-memory sang PostgreSQL cho flow auth/room/participants/worker-events.

## Da lam

- Them PostgreSQL client va transaction helper:
  - `backend-node/src/db/client.ts`
- Them migration SQL va migration runner:
  - `backend-node/src/db/migrations/001_init.sql`
  - `backend-node/src/db/migrate.ts`
- Them persistence service dung DB:
  - `backend-node/src/services/persistence.ts`
- Refactor API routes de dung persistence DB:
  - `backend-node/src/routes/v1.route.ts`
- Health check backend co DB ping:
  - `backend-node/src/routes/health.route.ts`
- Docker backend chay migration truoc khi boot:
  - `backend-node/Dockerfile`

## Bang du lieu da tao

- `users`
- `auth_sessions`
- `rooms`
- `participants`
- `worker_events`
- `voice_preferences`
- `transcript_items` (skeleton cho task sau)
- `schema_migrations`

## Lenh chay

```bash
cd backend-node
npm install
npm run migrate
npm run dev
```

## Ghi chu

- Co gang xoa file cu `src/services/store.ts` nhung bi `Access denied` tren he thong file hien tai; route da khong con import file nay.
