import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DataChannelEventV1 } from "../../../shared/contracts/types";

const KEY_PREFIX = "voice-rn-local-transcripts-v1";

export interface LocalTranscriptItem {
  id: string;
  session_id: string;
  room_id: string;
  type: string;
  utterance_id?: string;
  speaker_identity?: string;
  source_lang?: string;
  target_lang?: string;
  text?: string;
  translated_text?: string;
  timestamp: string;
}

function sessionKey(sessionId: string): string {
  return `${KEY_PREFIX}:${sessionId}`;
}

async function readSession(sessionId: string): Promise<LocalTranscriptItem[]> {
  const raw = await AsyncStorage.getItem(sessionKey(sessionId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LocalTranscriptItem[];
  } catch {
    return [];
  }
}

async function writeSession(sessionId: string, items: LocalTranscriptItem[]): Promise<void> {
  await AsyncStorage.setItem(sessionKey(sessionId), JSON.stringify(items));
}

function toLocalItem(event: DataChannelEventV1): LocalTranscriptItem {
  return {
    id: `${event.type}:${event.timestamp}:${event.utterance_id ?? "system"}`,
    session_id: event.session_id,
    room_id: event.room_id,
    type: event.type,
    utterance_id: "utterance_id" in event ? event.utterance_id : undefined,
    speaker_identity: "speaker_identity" in event ? event.speaker_identity : undefined,
    source_lang: "source_lang" in event ? event.source_lang : undefined,
    target_lang: "target_lang" in event ? event.target_lang : undefined,
    text: "text" in event ? event.text ?? undefined : undefined,
    translated_text:
      "translated_text" in event ? event.translated_text ?? undefined : undefined,
    timestamp: event.timestamp
  };
}

export async function appendTranscriptEvent(event: DataChannelEventV1): Promise<void> {
  if (!event.session_id) return;
  queueEvent(event.session_id, toLocalItem(event));
  scheduleFlush(event.session_id);
}

export async function getTranscriptBySession(
  sessionId: string
): Promise<LocalTranscriptItem[]> {
  await flushPending(sessionId);
  const items = await readSession(sessionId);
  return items.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function clearTranscriptBySession(sessionId: string): Promise<void> {
  pendingBySession.delete(sessionId);
  clearFlushTimer(sessionId);
  await AsyncStorage.removeItem(sessionKey(sessionId));
}

const pendingBySession = new Map<string, LocalTranscriptItem[]>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
let writeChain: Promise<void> = Promise.resolve();

function queueEvent(sessionId: string, item: LocalTranscriptItem): void {
  const current = pendingBySession.get(sessionId) ?? [];
  current.push(item);
  pendingBySession.set(sessionId, current);
}

function clearFlushTimer(sessionId: string): void {
  const timer = flushTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(sessionId);
  }
}

function scheduleFlush(sessionId: string): void {
  if (flushTimers.has(sessionId)) return;
  const timer = setTimeout(() => {
    flushTimers.delete(sessionId);
    void flushPending(sessionId);
  }, 400);
  flushTimers.set(sessionId, timer);
}

async function flushPending(sessionId: string): Promise<void> {
  const pending = pendingBySession.get(sessionId);
  if (!pending || pending.length === 0) return;
  pendingBySession.set(sessionId, []);

  writeChain = writeChain.then(async () => {
    const existing = await readSession(sessionId);
    const merged = [...existing, ...pending].slice(-1000);
    await writeSession(sessionId, merged);
  });

  await writeChain;
}
