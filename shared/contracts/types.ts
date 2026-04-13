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

interface DataChannelEventBaseV1 {
  type: DataEventType;
  session_id: string;
  room_id: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

interface UtteranceEventFieldsV1 {
  utterance_id: string;
  speaker_identity: string;
  source_lang: string;
  target_lang: string;
  text?: string;
}

export type SubtitlePartialEventV1 = DataChannelEventBaseV1 &
  UtteranceEventFieldsV1 & {
    type: "subtitle.partial";
  };

export type SubtitleFinalEventV1 = DataChannelEventBaseV1 &
  UtteranceEventFieldsV1 & {
    type: "subtitle.final";
  };

export type TranslationFinalEventV1 = DataChannelEventBaseV1 &
  UtteranceEventFieldsV1 & {
    type: "translation.final";
    translated_text: string;
  };

export type SessionStateEventV1 = DataChannelEventBaseV1 & {
  type: "session.state";
  text?: string;
};

export type ParticipantStateEventV1 = DataChannelEventBaseV1 & {
  type: "participant.state";
  text?: string;
};

export type WarningEventV1 = DataChannelEventBaseV1 & {
  type: "warning";
  text?: string;
};

export type ErrorEventV1 = DataChannelEventBaseV1 & {
  type: "error";
  text?: string;
};

export type DataChannelEventV1 =
  | SubtitlePartialEventV1
  | SubtitleFinalEventV1
  | TranslationFinalEventV1
  | SessionStateEventV1
  | ParticipantStateEventV1
  | WarningEventV1
  | ErrorEventV1;
