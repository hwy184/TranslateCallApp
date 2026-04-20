import type { DataChannelEventV1 } from "../../../shared/contracts/types";

const ALLOWED_TYPES = new Set([
  "subtitle.partial",
  "subtitle.final",
  "translation.final",
  "session.state",
  "participant.state",
  "warning",
  "error"
]);

function hasString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasUtteranceFields(value: Record<string, unknown>): boolean {
  return (
    hasString(value.utterance_id) &&
    hasString(value.speaker_identity) &&
    hasString(value.source_lang) &&
    hasString(value.target_lang)
  );
}

export function parseDataChannelEvent(input: string): DataChannelEventV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const value = parsed as Record<string, unknown>;
  if (!hasString(value.type) || !ALLOWED_TYPES.has(value.type)) return null;
  if (!hasString(value.session_id) || !hasString(value.room_id) || !hasString(value.timestamp)) {
    return null;
  }

  if (
    value.type === "subtitle.partial" ||
    value.type === "subtitle.final" ||
    value.type === "translation.final"
  ) {
    if (!hasUtteranceFields(value)) return null;
    if (value.type === "translation.final" && !hasString(value.translated_text)) {
      return null;
    }
  }

  return value as unknown as DataChannelEventV1;
}

export interface TimelineEvent {
  id: string;
  type: DataChannelEventV1["type"];
  speakerIdentity?: string;
  sourceLang?: string;
  targetLang?: string;
  text?: string;
  translatedText?: string;
  timestamp: string;
}

export function toTimelineEvent(event: DataChannelEventV1): TimelineEvent {
  const utteranceId = "utterance_id" in event ? event.utterance_id : undefined;
  return {
    id: `${event.type}:${event.timestamp}:${utteranceId ?? "system"}`,
    type: event.type,
    speakerIdentity: "speaker_identity" in event ? event.speaker_identity : undefined,
    sourceLang: "source_lang" in event ? event.source_lang : undefined,
    targetLang: "target_lang" in event ? event.target_lang : undefined,
    text: "text" in event ? event.text ?? undefined : undefined,
    translatedText:
      "translated_text" in event ? event.translated_text ?? undefined : undefined,
    timestamp: event.timestamp
  };
}
