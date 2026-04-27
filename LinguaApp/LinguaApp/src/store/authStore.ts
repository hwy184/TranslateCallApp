import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, API_BASE_URL, LIVEKIT_URL } from '../constants';
import type { AuthSession, RoomContext, User } from '../types/api';

interface AuthState {
  user: User | null;
  token: string | null;
  session: AuthSession | null;
  roomContext: RoomContext | null;
  apiBaseUrl: string;
  livekitUrl: string;
  isAuthenticated: boolean;
  isGuest: boolean;
  isLoading: boolean;

  setAuth: (user: User, session: AuthSession) => Promise<void>;
  setGuestAuth: (user: User, session: AuthSession) => Promise<void>;
  setGuest: () => void;
  setRoomContext: (value: RoomContext | null) => Promise<void>;
  setApiBaseUrl: (value: string) => Promise<void>;
  setLivekitUrl: (value: string) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
}

const safeJsonParse = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const normalizeApiBaseUrl = (value: string | null | undefined): string => {
  const next = value?.trim();

  if (!next) {
    return API_BASE_URL;
  }

  const knownBadHosts = ['168.192.1.9', '10.0.2.2', '127.0.0.1', 'localhost'];

  try {
    const parsed = new URL(next);
    if (knownBadHosts.includes(parsed.hostname)) {
      return API_BASE_URL;
    }
    return next;
  } catch {
    return API_BASE_URL;
  }
};

async function fetchServerLivekitUrl(apiBaseUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${apiBaseUrl}/client/config`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { livekit_url?: unknown };
    const livekitUrl =
      typeof payload.livekit_url === 'string' ? payload.livekit_url.trim() : '';
    return livekitUrl || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  session: null,
  roomContext: null,
  apiBaseUrl: API_BASE_URL,
  livekitUrl: LIVEKIT_URL,
  isAuthenticated: false,
  isGuest: false,
  isLoading: true,

  setAuth: async (user, session) => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.AUTH_TOKEN, session.accessToken],
      [STORAGE_KEYS.USER_INFO, JSON.stringify(user)],
      [STORAGE_KEYS.AUTH_SESSION, JSON.stringify(session)],
    ]);

    set({
      user,
      token: session.accessToken,
      session,
      isAuthenticated: user.type === 'registered',
      isGuest: user.type === 'guest',
    });
  },

  setGuestAuth: async (user, session) => {
    await get().setAuth(user, session);
  },

  setGuest: () => {
    set({ user: null, token: null, session: null, isAuthenticated: false, isGuest: true });
  },

  setRoomContext: async (value) => {
    if (value) {
      await AsyncStorage.setItem(STORAGE_KEYS.ROOM_CONTEXT, JSON.stringify(value));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.ROOM_CONTEXT);
    }
    set({ roomContext: value });
  },

  setApiBaseUrl: async (value) => {
    const next = normalizeApiBaseUrl(value);
    await AsyncStorage.setItem(STORAGE_KEYS.API_BASE_URL, next);
    const resolvedLivekitUrl = (await fetchServerLivekitUrl(next)) ?? get().livekitUrl;
    await AsyncStorage.setItem(STORAGE_KEYS.LIVEKIT_URL, resolvedLivekitUrl);
    set({ apiBaseUrl: next, livekitUrl: resolvedLivekitUrl });
  },

  setLivekitUrl: async (value) => {
    const next = value.trim();
    await AsyncStorage.setItem(STORAGE_KEYS.LIVEKIT_URL, next);
    set({ livekitUrl: next || LIVEKIT_URL });
  },

  logout: async () => {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.AUTH_TOKEN,
      STORAGE_KEYS.USER_INFO,
      STORAGE_KEYS.AUTH_SESSION,
      STORAGE_KEYS.ROOM_CONTEXT,
    ]);
    set({
      user: null,
      token: null,
      session: null,
      roomContext: null,
      isAuthenticated: false,
      isGuest: false,
    });
  },

  loadSession: async () => {
    try {
      const [token, userStr, sessionStr, roomStr, savedApiBaseUrl, savedLivekitUrl] = await AsyncStorage.multiGet([
        STORAGE_KEYS.AUTH_TOKEN,
        STORAGE_KEYS.USER_INFO,
        STORAGE_KEYS.AUTH_SESSION,
        STORAGE_KEYS.ROOM_CONTEXT,
        STORAGE_KEYS.API_BASE_URL,
        STORAGE_KEYS.LIVEKIT_URL,
      ]).then((pairs) => pairs.map((entry) => entry[1]));

      const user = safeJsonParse<User>(userStr);
      const session = safeJsonParse<AuthSession>(sessionStr);
      const roomContext = safeJsonParse<RoomContext>(roomStr);

      if (user && session && token) {
        const apiBaseUrl = normalizeApiBaseUrl(savedApiBaseUrl);
        const livekitFromBackend = await fetchServerLivekitUrl(apiBaseUrl);
        const resolvedLivekitUrl =
          livekitFromBackend ?? (savedLivekitUrl?.trim() || LIVEKIT_URL);
        if (apiBaseUrl !== savedApiBaseUrl?.trim()) {
          await AsyncStorage.setItem(STORAGE_KEYS.API_BASE_URL, apiBaseUrl);
        }
        if (livekitFromBackend && livekitFromBackend !== savedLivekitUrl?.trim()) {
          await AsyncStorage.setItem(STORAGE_KEYS.LIVEKIT_URL, livekitFromBackend);
        }

        set({
          user,
          token,
          session,
          roomContext,
          apiBaseUrl,
          livekitUrl: resolvedLivekitUrl,
          isAuthenticated: user.type === 'registered',
          isGuest: user.type === 'guest',
          isLoading: false,
        });
        return;
      }

      const apiBaseUrl = normalizeApiBaseUrl(savedApiBaseUrl);
      const livekitFromBackend = await fetchServerLivekitUrl(apiBaseUrl);
      const resolvedLivekitUrl =
        livekitFromBackend ?? (savedLivekitUrl?.trim() || LIVEKIT_URL);
      if (apiBaseUrl !== savedApiBaseUrl?.trim()) {
        await AsyncStorage.setItem(STORAGE_KEYS.API_BASE_URL, apiBaseUrl);
      }
      if (livekitFromBackend && livekitFromBackend !== savedLivekitUrl?.trim()) {
        await AsyncStorage.setItem(STORAGE_KEYS.LIVEKIT_URL, livekitFromBackend);
      }

      set({
        user: null,
        token: null,
        session: null,
        roomContext: null,
        apiBaseUrl,
        livekitUrl: resolvedLivekitUrl,
        isAuthenticated: false,
        isGuest: false,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },
}));
