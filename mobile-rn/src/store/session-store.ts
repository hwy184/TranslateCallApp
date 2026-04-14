import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_API_BASE_URL, DEFAULT_LIVEKIT_URL } from "../config/env";
import type { AuthSession, CreateRoomResponse, JoinRoomResponse, User } from "../types/api";
import {
  mapCreateToRoomContext,
  mapJoinToRoomContext,
  type RoomContext,
  type RoomRole
} from "./session-mapper";

interface SessionState {
  apiBaseUrl: string;
  livekitUrl: string;
  user: User | null;
  authSession: AuthSession | null;
  roomContext: RoomContext | null;
  lastSessionId: string | null;
  setApiBaseUrl: (value: string) => void;
  setLivekitUrl: (value: string) => void;
  setAuth: (value: { user: User; session: AuthSession }) => void;
  clearAuth: () => void;
  setRoomFromCreate: (value: {
    role: RoomRole;
    displayName: string;
    payload: CreateRoomResponse;
  }) => void;
  setRoomFromJoin: (value: {
    role: RoomRole;
    displayName: string;
    payload: JoinRoomResponse;
  }) => void;
  clearRoom: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      apiBaseUrl: DEFAULT_API_BASE_URL,
      livekitUrl: DEFAULT_LIVEKIT_URL,
      user: null,
      authSession: null,
      roomContext: null,
      lastSessionId: null,

      setApiBaseUrl: (value) => set({ apiBaseUrl: value.trim() }),
      setLivekitUrl: (value) => set({ livekitUrl: value.trim() }),

      setAuth: (value) => set({ user: value.user, authSession: value.session }),
      clearAuth: () => set({ user: null, authSession: null, roomContext: null }),

      setRoomFromCreate: ({ role, displayName, payload }) =>
        set({
          roomContext: mapCreateToRoomContext({ role, displayName, payload }),
          lastSessionId: payload.room.sessionId
        }),

      setRoomFromJoin: ({ role, displayName, payload }) =>
        set({
          roomContext: mapJoinToRoomContext({ role, displayName, payload }),
          lastSessionId: payload.room.sessionId
        }),

      clearRoom: () => set({ roomContext: null })
    }),
    {
      name: "voice-rn-session-v1",
      storage: createJSONStorage(() => AsyncStorage),
      // Avoid storing sensitive fields in plaintext storage.
      partialize: (state) => ({
        apiBaseUrl: state.apiBaseUrl,
        livekitUrl: state.livekitUrl,
        user: state.user,
        authSession: null,
        roomContext: null,
        lastSessionId: state.lastSessionId
      })
    }
  )
);
