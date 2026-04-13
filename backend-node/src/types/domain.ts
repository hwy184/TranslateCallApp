export type ParticipantRole = "host" | "guest";

export interface ParticipantSettings {
  source_language: string;
  target_language: string;
  voice_profile: string;
}

export interface Participant {
  participantId: string;
  identity: string;
  role: ParticipantRole;
  userId: string;
  joinedAt: string;
  settings: ParticipantSettings;
}

export interface Room {
  roomId: string;
  sessionId: string;
  hostParticipantId: string;
  guestParticipantId?: string;
  status: "waiting_guest" | "active" | "ended";
  createdAt: string;
  endedAt?: string;
  providerProfile: string;
  supportedLanguages: string[];
}

export interface User {
  userId: string;
  type: "guest" | "registered";
  displayName: string;
}

export interface AuthSession {
  accessToken: string;
  userId: string;
  createdAt: string;
}
