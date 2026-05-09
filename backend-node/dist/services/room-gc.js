import { env } from "../config/env.js";
import { persistence } from "./persistence.js";
import { stopWorkerSession } from "./worker-client.js";
const ROOM_LOCK_WINDOW_MS = env.ROOM_LOCK_MINUTES * 60 * 1000;
function computeCutoffIso() {
    return new Date(Date.now() - ROOM_LOCK_WINDOW_MS).toISOString();
}
export function startRoomGcLoop() {
    let running = false;
    const tick = async () => {
        if (running)
            return;
        running = true;
        try {
            const cutoffIso = computeCutoffIso();
            const candidates = await persistence.listOpenRoomsCreatedBefore(cutoffIso, 200);
            if (!candidates.length)
                return;
            for (const room of candidates) {
                try {
                    const closed = await persistence.endRoom(room.roomId);
                    if (closed.status !== "closed")
                        continue;
                    await stopWorkerSession(closed.sessionId, "room_timeout_gc").catch(() => undefined);
                    // eslint-disable-next-line no-console
                    console.log(`[room-gc] closed room=${closed.roomId} session=${closed.sessionId}`);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    // eslint-disable-next-line no-console
                    console.warn(`[room-gc] failed room=${room.roomId} reason=${message}`);
                }
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // eslint-disable-next-line no-console
            console.warn(`[room-gc] tick failed reason=${message}`);
        }
        finally {
            running = false;
        }
    };
    const timer = setInterval(() => {
        void tick();
    }, env.ROOM_GC_INTERVAL_MS);
    void tick();
    return () => {
        clearInterval(timer);
    };
}
