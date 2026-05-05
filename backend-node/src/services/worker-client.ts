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

function normalizeWorkerBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

const workerBaseUrls: string[] = (() => {
  const urls = new Set<string>();
  urls.add(normalizeWorkerBaseUrl(env.WORKER_INTERNAL_URL));
  for (const raw of env.WORKER_INTERNAL_URLS.split(",")) {
    const next = normalizeWorkerBaseUrl(raw);
    if (next) urls.add(next);
  }
  return Array.from(urls);
})();

const sessionWorkerMap = new Map<string, string>();

interface WorkerHealthSnapshot {
  baseUrl: string;
  activeSessions: number;
}

async function getWorkerHealth(baseUrl: string): Promise<WorkerHealthSnapshot | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const body = (await parseSafeJson(response)) as { active_sessions?: unknown } | null;
    const activeSessionsRaw = body?.active_sessions;
    const activeSessions =
      typeof activeSessionsRaw === "number" && Number.isFinite(activeSessionsRaw)
        ? activeSessionsRaw
        : Number.MAX_SAFE_INTEGER;
    return { baseUrl, activeSessions };
  } catch {
    return null;
  }
}

async function pickLeastLoadedWorkerBaseUrl(): Promise<string> {
  if (workerBaseUrls.length === 0) {
    return normalizeWorkerBaseUrl(env.WORKER_INTERNAL_URL);
  }
  if (workerBaseUrls.length === 1) return workerBaseUrls[0]!;

  const snapshots = (await Promise.all(workerBaseUrls.map((baseUrl) => getWorkerHealth(baseUrl)))).filter(
    (item): item is WorkerHealthSnapshot => item !== null
  );
  if (snapshots.length === 0) return workerBaseUrls[0]!;

  snapshots.sort((a, b) => a.activeSessions - b.activeSessions);
  return snapshots[0]!.baseUrl;
}

async function resolveWorkerForStart(sessionId: string): Promise<string> {
  const existing = sessionWorkerMap.get(sessionId);
  if (existing) return existing;
  const selected = await pickLeastLoadedWorkerBaseUrl();
  sessionWorkerMap.set(sessionId, selected);
  return selected;
}

function resolveWorkerForExistingSession(sessionId: string): string {
  const mapped = sessionWorkerMap.get(sessionId);
  if (mapped) return mapped;
  return workerBaseUrls[0] ?? normalizeWorkerBaseUrl(env.WORKER_INTERNAL_URL);
}

export async function startWorkerSession(input: StartWorkerSessionInput): Promise<void> {
  const workerBase = await resolveWorkerForStart(input.sessionId);
  const url = `${workerBase}/internal/sessions/start`;
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
    sessionWorkerMap.delete(input.sessionId);
    const body = await parseSafeJson(response);
    throw new Error(`worker_start_failed:${response.status}:${JSON.stringify(body)}`);
  }
}

export async function stopWorkerSession(sessionId: string, reason: string): Promise<void> {
  const workerBase = resolveWorkerForExistingSession(sessionId);
  const url = `${workerBase}/internal/sessions/${sessionId}/stop`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason })
  });

  if (!response.ok) {
    const body = await parseSafeJson(response);
    throw new Error(`worker_stop_failed:${response.status}:${JSON.stringify(body)}`);
  }
  sessionWorkerMap.delete(sessionId);
}

export async function updateWorkerParticipantSettings(input: {
  sessionId: string;
  participantIdentity: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  voiceProfile?: string;
}): Promise<void> {
  const workerBase = resolveWorkerForExistingSession(input.sessionId);
  const url = `${workerBase}/internal/sessions/${input.sessionId}/participants/${encodeURIComponent(input.participantIdentity)}/settings`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source_language: input.sourceLanguage,
      target_language: input.targetLanguage,
      voice_profile: input.voiceProfile
    })
  });

  if (!response.ok) {
    const body = await parseSafeJson(response);
    throw new Error(`worker_settings_failed:${response.status}:${JSON.stringify(body)}`);
  }
}
