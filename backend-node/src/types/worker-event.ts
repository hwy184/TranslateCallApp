export type WorkerEventType =
  | "subtitle.partial"
  | "subtitle.final"
  | "translation.final"
  | "session.state"
  | "participant.state"
  | "warning"
  | "error";

export interface WorkerEventPayload {
  type: WorkerEventType;
  session_id: string;
  room_id: string;
  timestamp: string;
  utterance_id?: string;
  speaker_identity?: string;
  source_lang?: string;
  target_lang?: string;
  text?: string;
  translated_text?: string;
  details?: Record<string, unknown>;
}

export interface HistoryItem {
  id: number;
  room_id: string;
  session_id: string;
  utterance_id: string;
  speaker_identity: string;
  source_lang: string;
  target_lang: string;
  source_text: string | null;
  translated_text: string | null;
  event_type: string;
  created_at: string;
}
