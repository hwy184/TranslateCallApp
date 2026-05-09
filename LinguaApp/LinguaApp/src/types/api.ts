export interface BackendErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface User {
  userId: string;
  type: 'guest' | 'registered';
  displayName: string;
  email?: string;
}

export interface AuthSession {
  accessToken: string;
  userId: string;
  createdAt: string;
}

export interface ParticipantSettings {
  source_language: string;
  target_language: string;
  voice_profile: string;
}

export interface Participant {
  participantId: string;
  identity: string;
  role: 'host' | 'guest';
  userId: string;
  joinedAt: string;
  settings: ParticipantSettings;
}

export interface Room {
  roomId: string;
  roomCode: string;
  sessionId: string;
  hostParticipantId: string;
  guestParticipantId?: string;
  status: 'waiting' | 'active' | 'closed';
  createdAt: string;
  endedAt?: string;
  providerProfile: string;
  supportedLanguages: string[];
}

export interface AuthResponse {
  user: User;
  session: AuthSession;
}

export interface CreateRoomResponse {
  room: Room;
  room_short_code?: string;
  participant: Participant;
  livekit: {
    room_name: string;
    token: string | null;
    token_status: string;
  };
}

export interface JoinRoomResponse {
  room: Room;
  room_short_code?: string;
  participant: Participant;
  worker_session: {
    session_id: string;
    state: string;
    participants?: number;
  };
  warnings?: string[];
  livekit: {
    room_name: string;
    token: string | null;
    token_status: string;
  };
}

export interface RoomStatusResponse {
  room: Room;
  room_short_code?: string;
}

export interface EndRoomResponse {
  room: Room;
  worker_session: {
    session_id: string;
    state: string;
  };
  warnings: string[];
}

export interface LeaveParticipantResponse {
  room: Room;
  room_short_code?: string;
  participant: Participant;
  worker_session?: {
    session_id: string;
    state: string;
  };
  warnings?: string[];
}

export interface HistoryItem {
  id: number;
  room_id: string;
  session_id: string;
  conversation_id?: string;
  title?: string;
  title_updated_at?: string;
  utterance_id: string;
  speaker_identity: string;
  source_lang: string;
  target_lang: string;
  source_text: string | null;
  translated_text: string | null;
  event_type: string;
  created_at: string;
}

export interface HistoryResponse {
  items: HistoryItem[];
}

export interface VoicePreferenceResponse {
  preference: {
    user_id: string;
    settings: Record<string, unknown>;
    updated_at: string;
  };
}

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  avatar?: string;
  status?: 'online' | 'offline' | 'away';
  handle?: string;
}

export interface RoomContext {
  role: 'host' | 'guest';
  roomId: string;
  sessionId: string;
  participantId: string;
  participantIdentity: string;
  participantDisplayName: string;
  roomTitle?: string;
  roomStatusLabel?: string;
  roomShortCode?: string;
  workerSessionState?: string;
  livekitRoomName: string;
  livekitToken: string | null;
  livekitTokenStatus: string;
}
