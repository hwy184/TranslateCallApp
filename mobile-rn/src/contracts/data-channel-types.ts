export type BaseEventType =
  | "session.state"
  | "participant.state"
  | "warning"
  | "error";

export type UtteranceEventType =
  | "subtitle.partial"
  | "subtitle.final"
  | "translation.final";

interface BaseEvent {
  type: BaseEventType | UtteranceEventType;
  session_id: string;
  room_id: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

interface UtteranceEvent extends BaseEvent {
  type: UtteranceEventType;
  utterance_id: string;
  speaker_identity: string;
  source_lang: string;
  target_lang: string;
  text?: string;
  translated_text?: string;
}

export type DataChannelEventV1 = BaseEvent | UtteranceEvent;
