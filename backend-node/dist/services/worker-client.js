import { env } from "../config/env.js";
async function parseSafeJson(response) {
    try {
        return await response.json();
    }
    catch {
        return null;
    }
}
export async function startWorkerSession(input) {
    const url = `${env.WORKER_INTERNAL_URL}/internal/sessions/start`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            session_id: input.sessionId,
            room_id: input.roomId,
            provider_profile: input.providerProfile,
            room_metadata: input.roomMetadata,
            participants: input.participants,
            livekit: input.livekit ?? {}
        })
    });
    if (!response.ok) {
        const body = await parseSafeJson(response);
        throw new Error(`worker_start_failed:${response.status}:${JSON.stringify(body)}`);
    }
}
export async function stopWorkerSession(sessionId, reason) {
    const url = `${env.WORKER_INTERNAL_URL}/internal/sessions/${sessionId}/stop`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason })
    });
    if (!response.ok) {
        const body = await parseSafeJson(response);
        throw new Error(`worker_stop_failed:${response.status}:${JSON.stringify(body)}`);
    }
}
