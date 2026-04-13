export type ParticipantRole = "host" | "guest" | "worker";

export interface RoomMetadataV1 {
  session_id: string;
  mode: "bidirectional";
  audio_mode: "translated_only";
  supported_languages: string[];
  provider_profile: string;
}

export interface ParticipantMetadataV1 {
  role: ParticipantRole;
  identity: string;
  source_language: string;
  target_language: string;
  voice_profile: string;
}

export type DataEventType =
  | "subtitle.partial"
  | "subtitle.final"
  | "translation.final"
  | "session.state"
  | "participant.state"
  | "warning"
  | "error";

export interface DataChannelEventV1 {
  type: DataEventType;
  session_id: string;
  room_id: string;
  utterance_id: string;
  timestamp: string;
  speaker_identity: string;
  source_lang: string;
  target_lang: string;
  text?: string;
  translated_text?: string;
  details?: Record<string, unknown>;
}
