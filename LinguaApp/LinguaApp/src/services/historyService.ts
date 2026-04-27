import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';
import apiClient from './apiClient';
import type { HistoryItem, HistoryResponse } from '../types/api';

export interface ConversationHistory {
  id: string;
  sessionId: string;
  roomId: string;
  title: string;
  date: string;
  lineCount: number;
  items: HistoryItem[];
}

function toConversation(items: HistoryItem[]): ConversationHistory {
  const newestFirst = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const chronological = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const first = newestFirst[0];
  const speakers = Array.from(new Set(newestFirst.map((it) => it.speaker_identity))).slice(0, 2);

  return {
    id: first.session_id,
    sessionId: first.session_id,
    roomId: first.room_id,
    title: speakers.length ? `Session ${first.session_id.slice(0, 8)} (${speakers.join(', ')})` : `Session ${first.session_id.slice(0, 8)}`,
    date: new Date(first.created_at).toLocaleString(),
    lineCount: newestFirst.length,
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
  const res = await apiClient.get<HistoryResponse>('/history?limit=300');
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
  const detail = await getHistoryDetail(sessionId);
  const ids = detail.items.map((item) => item.id);
  await Promise.all(ids.map((id) => apiClient.delete(`/history/${id}`)));
};

export const saveHistoryLocal = async (history: ConversationHistory): Promise<void> => {
  const existing = await getHistoryLocal();
  const updated = [history, ...existing.filter((h) => h.id !== history.id)].slice(0, 10);
  await AsyncStorage.setItem(STORAGE_KEYS.GUEST_HISTORY, JSON.stringify(updated));
};

export const getHistoryLocal = async (): Promise<ConversationHistory[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.GUEST_HISTORY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ConversationHistory[];
  } catch {
    return [];
  }
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
  await apiClient.post('/history/sync', { items });
};
