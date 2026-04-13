import { env } from "../config/env.js";

interface StartWorkerSessionInput {
  sessionId: string;
  roomId: string;
  providerProfile: string;
  roomMetadata: {
    mode: "bidirectional";
    audio_mode: "translated_only";
    supported_languages: string[];
    provider_profile: string;
  };
  participants: Array<{
    role: "host" | "guest";
    identity: string;
    source_language: string;
    target_language: string;
    voice_profile: string;
  }>;
  livekit?: {
    worker_identity?: string;
  };
}

async function parseSafeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function startWorkerSession(input: StartWorkerSessionInput): Promise<void> {
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

export async function stopWorkerSession(sessionId: string, reason: string): Promise<void> {
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
