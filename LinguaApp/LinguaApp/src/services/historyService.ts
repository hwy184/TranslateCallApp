import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';
import apiClient from './apiClient';
import { ApiClientError } from './errors';
import type { HistoryItem, HistoryResponse } from '../types/api';

export interface ConversationHistory {
  id: string;
  sessionId: string;
  roomId: string;
  title: string;
  date: string;
  lineCount: number;
  is_synced: boolean;
  items: HistoryItem[];
}

function normalizeLang(input: string | null | undefined): 'vi' | 'en' {
  const value = String(input ?? '').trim().toLowerCase();
  if (value.startsWith('en')) return 'en';
  return 'vi';
}

function toConversation(items: HistoryItem[]): ConversationHistory {
  const newestFirst = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const chronological = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const first = newestFirst[0];
  const speakers = Array.from(new Set(newestFirst.map((it) => it.speaker_identity))).slice(0, 2);
  const rawTitle = String(first.title ?? '').trim();
  const normalizedRawTitle = rawTitle.toLowerCase();
  const hasUsableTitle =
    rawTitle.length > 0 &&
    !normalizedRawTitle.startsWith('session session_') &&
    !normalizedRawTitle.startsWith('conversation session_');
  const fallbackTitle = speakers.length
    ? `Session ${first.session_id.slice(0, 8)} (${speakers.join(', ')})`
    : `Session ${first.session_id.slice(0, 8)}`;

  return {
    id: first.session_id,
    sessionId: first.session_id,
    roomId: first.room_id,
    title: hasUsableTitle ? rawTitle : fallbackTitle,
    date: new Date(first.created_at).toLocaleString(),
    lineCount: newestFirst.length,
    is_synced: true,
    items: chronological,
  };
}

function groupBySession(items: HistoryItem[]): ConversationHistory[] {
  const bySession = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const current = bySession.get(item.session_id) ?? [];
    current.push(item);
    bySession.set(item.session_id, current);
  }

  return Array.from(bySession.values())
    .map((group) => toConversation(group))
    .sort((a, b) => {
      const latestA = a.items[a.items.length - 1]?.created_at ?? '';
      const latestB = b.items[b.items.length - 1]?.created_at ?? '';
      return latestB.localeCompare(latestA);
    });
}

export const getHistory = async (): Promise<ConversationHistory[]> => {
  const res = await apiClient.get<HistoryResponse>('/history?limit=20');
  return groupBySession(res.items);
};

export const getHistoryDetail = async (sessionId: string): Promise<ConversationHistory> => {
  const res = await apiClient.get<HistoryResponse>(`/history?session_id=${encodeURIComponent(sessionId)}&limit=500`);
  if (!res.items.length) {
    throw new Error('history_empty');
  }
  return toConversation(res.items);
};

export const deleteConversation = async (sessionId: string): Promise<void> => {
  let detail: ConversationHistory;
  try {
    detail = await getHistoryDetail(sessionId);
  } catch (error) {
    if (error instanceof Error && error.message === 'history_empty') {
      return;
    }
    throw error;
  }
  const ids = detail.items.map((item) => item.id);
  if (!ids.length) return;
  const results = await Promise.allSettled(ids.map((id) => apiClient.delete(`/history/${id}`)));
  const actionableFailure = results.find((result) => {
    if (result.status !== 'rejected') return false;
    const reason = result.reason;
    if (reason instanceof ApiClientError && reason.code === 'HISTORY_NOT_FOUND') {
      return false;
    }
    return true;
  });
  if (actionableFailure && actionableFailure.status === 'rejected') {
    throw actionableFailure.reason;
  }
};

export const saveHistoryLocal = async (history: ConversationHistory): Promise<void> => {
  const existing = await getHistoryLocal();
  const updated = [{ ...history, is_synced: false }, ...existing.filter((h) => h.id !== history.id)];
  await AsyncStorage.setItem(STORAGE_KEYS.GUEST_HISTORY, JSON.stringify(updated));
};

export const getHistoryLocal = async (): Promise<ConversationHistory[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.GUEST_HISTORY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ConversationHistory[];
    return parsed.map((item) => ({
      ...item,
      is_synced: Boolean((item as any).is_synced),
    }));
  } catch {
    return [];
  }
};

export const reconcileLocalSyncStateWithCloud = async (): Promise<number> => {
  const local = await getHistoryLocal();
  if (!local.length) return 0;

  const cloud = await getHistory();
  const cloudSessionIds = new Set(cloud.map((conversation) => conversation.sessionId));
  let changed = 0;
  const updated = local.map((conversation) => {
    const shouldBeSynced = cloudSessionIds.has(conversation.sessionId);
    if (conversation.is_synced !== shouldBeSynced) {
      changed += 1;
      return { ...conversation, is_synced: shouldBeSynced };
    }
    return conversation;
  });

  if (changed > 0) {
    await AsyncStorage.setItem(STORAGE_KEYS.GUEST_HISTORY, JSON.stringify(updated));
  }
  return changed;
};

export const deleteHistoryLocal = async (id: string): Promise<void> => {
  const existing = await getHistoryLocal();
  const updated = existing.filter((h) => h.id !== id);
  await AsyncStorage.setItem(STORAGE_KEYS.GUEST_HISTORY, JSON.stringify(updated));
};

export const deleteAllHistoryLocal = async (): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.GUEST_HISTORY, JSON.stringify([]));
};

export const deleteAllHistoryCloud = async (): Promise<void> => {
  await apiClient.delete('/history');
};

export const syncHistory = async (items: HistoryItem[]): Promise<void> => {
  if (!items.length) return;
  const normalizedItems = items
    .map((item) => ({
      room_id: String(item.room_id ?? '').trim(),
      session_id: String(item.session_id ?? '').trim(),
      conversation_id: String(item.conversation_id ?? item.session_id ?? '').trim(),
      title: String(item.title ?? `Session ${String(item.session_id ?? '').slice(0, 8)}`).trim(),
      title_updated_at: item.title_updated_at ?? new Date().toISOString(),
      utterance_id: String(item.utterance_id ?? '').trim(),
      speaker_identity: String(item.speaker_identity ?? '').trim(),
      source_lang: normalizeLang(item.source_lang),
      target_lang: normalizeLang(item.target_lang),
      source_text: item.source_text,
      translated_text: item.translated_text,
      event_type: String(item.event_type ?? 'translation.final').trim(),
      created_at: item.created_at ?? new Date().toISOString(),
    }))
    .filter(
      (item) =>
        item.room_id &&
        item.session_id &&
        item.conversation_id &&
        item.title &&
        item.utterance_id &&
        item.speaker_identity &&
        item.event_type
    );

  if (!normalizedItems.length) return;
  await apiClient.post('/history/sync', { items: normalizedItems });
};

export const syncLocalHistoryToCloud = async (): Promise<number> => {
  const local = await getHistoryLocal();
  if (!local.length) return 0;

  const cloudConversations = await getHistory();
  const maxCloudConversations = 20;
  const availableSlots = Math.max(0, maxCloudConversations - cloudConversations.length);

  const candidates = local
    .filter((conversation) => !conversation.is_synced)
    .sort((a, b) => (b.items[b.items.length - 1]?.created_at ?? '').localeCompare(a.items[a.items.length - 1]?.created_at ?? ''));
  if (!candidates.length || availableSlots === 0) return 0;

  const toSync = candidates.slice(0, availableSlots);
  let syncedConversations = 0;
  const nextLocal = [...local];
  for (const conversation of toSync) {
    const items = conversation.items ?? [];
    if (!items.length) continue;
    await syncHistory(items);
    const index = nextLocal.findIndex((item) => item.id === conversation.id);
    if (index >= 0) {
      nextLocal[index] = { ...nextLocal[index], is_synced: true };
      syncedConversations += 1;
    }
  }
  await AsyncStorage.setItem(STORAGE_KEYS.GUEST_HISTORY, JSON.stringify(nextLocal));
  return syncedConversations;
};

export const syncOneLocalConversationToCloud = async (sessionId: string): Promise<boolean> => {
  const local = await getHistoryLocal();
  const target = local.find((conversation) => conversation.id === sessionId);
  if (!target || !target.items?.length) return false;

  const cloudConversations = await getHistory();
  const hasCloudAlready = cloudConversations.some((conversation) => conversation.id === sessionId);
  if (!hasCloudAlready && cloudConversations.length >= 20) {
    throw new ApiClientError({
      status: 409,
      code: 'HISTORY_CLOUD_LIMIT_REACHED',
      message: 'Cloud history limit reached',
      details: { max_conversations: 20 },
    });
  }

  await syncHistory(target.items);
  const updated = local.map((conversation) =>
    conversation.id === sessionId ? { ...conversation, is_synced: true } : conversation
  );
  await AsyncStorage.setItem(STORAGE_KEYS.GUEST_HISTORY, JSON.stringify(updated));
  return true;
};

