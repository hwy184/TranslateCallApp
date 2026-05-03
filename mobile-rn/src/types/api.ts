import { z } from "zod";

export const backendErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().nullable().optional()
  })
});

export type BackendErrorPayload = z.infer<typeof backendErrorSchema>;

export const userSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(["guest", "registered"]),
  displayName: z.string().min(1)
});

export type User = z.infer<typeof userSchema>;

export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  userId: z.string().min(1),
  createdAt: z.string().min(1)
});

export type AuthSession = z.infer<typeof authSessionSchema>;

export const participantSettingsSchema = z.object({
  source_language: z.string().min(2),
  target_language: z.string().min(2),
  voice_profile: z.string().min(1)
});

export type ParticipantSettings = z.infer<typeof participantSettingsSchema>;

export const participantSchema = z.object({
  participantId: z.string().min(1),
  identity: z.string().min(1),
  role: z.enum(["host", "guest"]),
  userId: z.string().min(1),
  joinedAt: z.string().min(1),
  settings: participantSettingsSchema
});

export type Participant = z.infer<typeof participantSchema>;

export const roomSchema = z.object({
  roomId: z.string().min(1),
  sessionId: z.string().min(1),
  hostParticipantId: z.string().min(1),
  guestParticipantId: z.string().min(1).optional(),
  status: z.enum(["waiting", "active", "closed"]),
  createdAt: z.string().min(1),
  endedAt: z.string().min(1).optional(),
  providerProfile: z.string().min(1),
  supportedLanguages: z.array(z.string())
});

export type Room = z.infer<typeof roomSchema>;

export const roomMetadataSchema = z.object({
  session_id: z.string().min(1),
  mode: z.string(),
  audio_mode: z.string(),
  supported_languages: z.array(z.string()),
  provider_profile: z.string()
});

export const participantMetadataSchema = z.object({
  role: z.enum(["host", "guest", "worker"]).or(z.string()),
  identity: z.string(),
  source_language: z.string(),
  target_language: z.string(),
  voice_profile: z.string()
});

export const livekitPayloadSchema = z.object({
  room_name: z.string().min(1),
  token: z.string().nullable(),
  token_status: z.string()
});

export const authResponseSchema = z.object({
  user: userSchema,
  session: authSessionSchema
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const createRoomResponseSchema = z.object({
  room: roomSchema,
  room_short_code: z.string().min(1).optional(),
  participant: participantSchema,
  metadata: z.object({
    room: roomMetadataSchema,
    participant: participantMetadataSchema
  }),
  livekit: livekitPayloadSchema
});

export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;

export const joinRoomResponseSchema = z.object({
  room: roomSchema,
  room_short_code: z.string().min(1).optional(),
  participant: participantSchema,
  metadata: z.object({
    room: roomMetadataSchema,
    participant: participantMetadataSchema
  }),
  worker_session: z.object({
    session_id: z.string().min(1),
    state: z.string().min(1),
    participants: z.number().optional()
  }),
  livekit: livekitPayloadSchema
});

export type JoinRoomResponse = z.infer<typeof joinRoomResponseSchema>;

export const endRoomResponseSchema = z.object({
  room: roomSchema,
  worker_session: z.object({
    session_id: z.string().min(1),
    state: z.string().min(1)
  }),
  warnings: z.array(z.string())
});

export type EndRoomResponse = z.infer<typeof endRoomResponseSchema>;

export const resolveRoomResponseSchema = z.object({
  room: roomSchema,
  room_short_code: z.string().min(1)
});

export type ResolveRoomResponse = z.infer<typeof resolveRoomResponseSchema>;

export const historyItemSchema = z.object({
  id: z.number(),
  room_id: z.string().min(1),
  session_id: z.string().min(1),
  conversation_id: z.string().min(1),
  title: z.string().min(1),
  title_updated_at: z.string().min(1),
  utterance_id: z.string().min(1),
  speaker_identity: z.string().min(1),
  source_lang: z.string().min(2),
  target_lang: z.string().min(2),
  source_text: z.string().nullable(),
  translated_text: z.string().nullable(),
  event_type: z.string().min(1),
  created_at: z.string().min(1)
});

export type HistoryItem = z.infer<typeof historyItemSchema>;

export const historyResponseSchema = z.object({
  items: z.array(historyItemSchema)
});

export type HistoryResponse = z.infer<typeof historyResponseSchema>;

export const historySyncResponseSchema = z.object({
  synced: z.number().int().nonnegative(),
  received: z.number().int().nonnegative()
});

export type HistorySyncResponse = z.infer<typeof historySyncResponseSchema>;

export const conversationRenameResponseSchema = z.object({
  conversation: z.object({
    conversation_id: z.string().min(1),
    title: z.string().min(1),
    title_updated_at: z.string().min(1)
  })
});

export type ConversationRenameResponse = z.infer<typeof conversationRenameResponseSchema>;

export const voicePreferenceSchema = z.object({
  user_id: z.string().min(1),
  settings: z.record(z.unknown()),
  updated_at: z.string().min(1)
});

export type VoicePreference = z.infer<typeof voicePreferenceSchema>;

export const voicePreferenceResponseSchema = z.object({
  preference: voicePreferenceSchema
});

export type VoicePreferenceResponse = z.infer<typeof voicePreferenceResponseSchema>;
