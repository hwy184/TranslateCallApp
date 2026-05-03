import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DataChannelEventV1 } from "../contracts/data-channel-types";

const KEY_PREFIX = "voice-rn-local-transcripts-v1";
const META_PREFIX = "voice-rn-conversation-meta-v1";

export interface LocalTranscriptItem {
  id: string;
  session_id: string;
  conversation_id: string;
  title: string;
  title_updated_at: string;
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

function metaKey(sessionId: string): string {
  return `${META_PREFIX}:${sessionId}`;
}

function defaultTitle(sessionId: string): string {
  return `Conversation ${sessionId.slice(-6)}`;
}

interface ConversationMeta {
  conversation_id: string;
  title: string;
  title_updated_at: string;
}

async function readMeta(sessionId: string): Promise<ConversationMeta> {
  const raw = await AsyncStorage.getItem(metaKey(sessionId));
  if (!raw) {
    const now = new Date().toISOString();
    return {
      conversation_id: sessionId,
      title: defaultTitle(sessionId),
      title_updated_at: now
    };
  }
  try {
    const parsed = JSON.parse(raw) as ConversationMeta;
    return {
      conversation_id: parsed.conversation_id || sessionId,
      title: parsed.title || defaultTitle(sessionId),
      title_updated_at: parsed.title_updated_at || new Date().toISOString()
    };
  } catch {
    const now = new Date().toISOString();
    return {
      conversation_id: sessionId,
      title: defaultTitle(sessionId),
      title_updated_at: now
    };
  }
}

async function writeMeta(sessionId: string, meta: ConversationMeta): Promise<void> {
  await AsyncStorage.setItem(metaKey(sessionId), JSON.stringify(meta));
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

function toLocalItem(event: DataChannelEventV1, meta: ConversationMeta): LocalTranscriptItem {
  const utteranceId = "utterance_id" in event ? event.utterance_id : undefined;
  return {
    id: `${event.type}:${event.timestamp}:${utteranceId ?? "system"}`,
    session_id: event.session_id,
    conversation_id: meta.conversation_id,
    title: meta.title,
    title_updated_at: meta.title_updated_at,
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
  const meta = await readMeta(event.session_id);
  queueEvent(event.session_id, toLocalItem(event, meta));
  scheduleFlush(event.session_id);
}

export async function getTranscriptBySession(
  sessionId: string,
  limit?: number
): Promise<LocalTranscriptItem[]> {
  await flushPending(sessionId);
  const items = await readSession(sessionId);
  const sorted = items.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (!limit || limit <= 0) return sorted;
  return sorted.slice(0, limit);
}

export async function clearTranscriptBySession(sessionId: string): Promise<void> {
  pendingBySession.delete(sessionId);
  clearFlushTimer(sessionId);
  await AsyncStorage.removeItem(sessionKey(sessionId));
  await AsyncStorage.removeItem(metaKey(sessionId));
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

export async function getConversationMetaBySession(sessionId: string): Promise<ConversationMeta> {
  return readMeta(sessionId);
}

export async function renameConversationLocal(sessionId: string, title: string): Promise<ConversationMeta> {
  const current = await readMeta(sessionId);
  const updated: ConversationMeta = {
    conversation_id: current.conversation_id || sessionId,
    title: title.trim() || current.title,
    title_updated_at: new Date().toISOString()
  };
  await writeMeta(sessionId, updated);

  // Propagate new title to existing local transcript items for consistent UI rendering.
  const items = await readSession(sessionId);
  const patched = items.map((item) => ({
    ...item,
    conversation_id: updated.conversation_id,
    title: updated.title,
    title_updated_at: updated.title_updated_at
  }));
  await writeSession(sessionId, patched);
  return updated;
}
