import {
  authResponseSchema,
  createRoomResponseSchema,
  endRoomResponseSchema,
  conversationRenameResponseSchema,
  historyResponseSchema,
  historySyncResponseSchema,
  joinRoomResponseSchema,
  resolveRoomResponseSchema,
  voicePreferenceResponseSchema
} from "../types/api";
import type {
  AuthResponse,
  CreateRoomResponse,
  EndRoomResponse,
  ConversationRenameResponse,
  HistoryResponse,
  HistorySyncResponse,
  JoinRoomResponse,
  ResolveRoomResponse,
  VoicePreferenceResponse
} from "../types/api";
import { ApiClientError, parseBackendError } from "./errors";
import type { ZodType } from "zod";

type JsonValue = Record<string, unknown> | null;

async function safeParseJson(response: Response): Promise<JsonValue> {
  try {
    return (await response.json()) as JsonValue;
  } catch {
    return null;
  }
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getAccessToken?: () => string | null
  ) {}

  private async request<T>(
    path: string,
    options: RequestInit,
    schema: ZodType<T>
  ): Promise<T> {
    const timeoutMs = 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = new Headers(options.headers ?? {});
    const accessToken = this.getAccessToken?.() ?? null;
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
      headers.set("x-access-token", accessToken);
    }

    let response: Response;
    let payload: JsonValue;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        signal: controller.signal
      });
      payload = await safeParseJson(response);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiClientError({
          status: 0,
          code: "NETWORK_TIMEOUT",
          message: "Request timed out"
        });
      }
      throw new ApiClientError({
        status: 0,
        code: "NETWORK_ERROR",
        message: "Cannot connect to backend",
        details: error
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw parseBackendError(response.status, payload);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiClientError({
        status: response.status,
        code: "BAD_RESPONSE_SHAPE",
        message: "Backend response shape mismatch",
        details: payload
      });
    }
    return parsed.data;
  }

  authGuest(displayName: string): Promise<AuthResponse> {
    return this.request(
      "/api/v1/auth/guest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName })
      },
      authResponseSchema
    );
  }

  authRegister(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResponse> {
    return this.request(
      "/api/v1/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          display_name: input.displayName
        })
      },
      authResponseSchema
    );
  }

  authLogin(input: { email: string; password: string }): Promise<AuthResponse> {
    return this.request(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: input.email,
          password: input.password
        })
      },
      authResponseSchema
    );
  }

  createRoom(input: {
    hostUserId: string;
    hostIdentity: string;
    hostDisplayName: string;
    sourceLanguage: string;
    targetLanguage: string;
    voiceProfile: string;
  }): Promise<CreateRoomResponse> {
    return this.request(
      "/api/v1/rooms",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host_user_id: input.hostUserId,
          host_identity: input.hostIdentity,
          host_display_name: input.hostDisplayName,
          provider_profile: "silero+google_stt+openai_translate+google_tts",
          supported_languages: ["vi", "en"],
          host_settings: {
            source_language: input.sourceLanguage,
            target_language: input.targetLanguage,
            voice_profile: input.voiceProfile
          }
        })
      },
      createRoomResponseSchema
    );
  }

  joinRoom(input: {
    roomId: string;
    guestUserId: string;
    guestIdentity: string;
    guestDisplayName: string;
    sourceLanguage: string;
    targetLanguage: string;
    voiceProfile: string;
  }): Promise<JoinRoomResponse> {
    return this.request(
      "/api/v1/rooms/join",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: input.roomId,
          guest_user_id: input.guestUserId,
          guest_identity: input.guestIdentity,
          guest_display_name: input.guestDisplayName,
          guest_settings: {
            source_language: input.sourceLanguage,
            target_language: input.targetLanguage,
            voice_profile: input.voiceProfile
          }
        })
      },
      joinRoomResponseSchema
    );
  }

  resolveRoomByCode(code: string): Promise<ResolveRoomResponse> {
    return this.request(
      `/api/v1/rooms/resolve/${encodeURIComponent(code)}`,
      {
        method: "GET"
      },
      resolveRoomResponseSchema
    );
  }

  endRoom(roomId: string): Promise<EndRoomResponse> {
    return this.request(
      `/api/v1/rooms/${roomId}/end`,
      {
        method: "POST"
      },
      endRoomResponseSchema
    );
  }

  historyBySession(sessionId: string): Promise<HistoryResponse> {
    const query = new URLSearchParams({ session_id: sessionId });
    return this.request(
      `/api/v1/history?${query.toString()}`,
      {
        method: "GET"
      },
      historyResponseSchema
    );
  }

  historySync(input: {
    items: Array<{
      room_id: string;
      session_id: string;
      conversation_id: string;
      title: string;
      title_updated_at?: string;
      utterance_id: string;
      speaker_identity: string;
      source_lang: "vi" | "en";
      target_lang: "vi" | "en";
      source_text: string | null;
      translated_text: string | null;
      event_type: string;
      created_at?: string;
    }>;
  }): Promise<HistorySyncResponse> {
    return this.request(
      "/api/v1/history/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      },
      historySyncResponseSchema
    );
  }

  renameConversationTitle(input: {
    conversationId: string;
    title: string;
    titleUpdatedAt?: string;
  }): Promise<ConversationRenameResponse> {
    return this.request(
      `/api/v1/history/conversations/${encodeURIComponent(input.conversationId)}/title`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          title_updated_at: input.titleUpdatedAt
        })
      },
      conversationRenameResponseSchema
    );
  }

  upsertVoicePreference(input: {
    userId: string;
    speed?: number;
    gender?: "male" | "female" | "neutral";
    profile?: string;
  }): Promise<VoicePreferenceResponse> {
    return this.request(
      "/api/v1/me/preferences/voice",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: input.userId,
          speed: input.speed,
          gender: input.gender,
          profile: input.profile
        })
      },
      voicePreferenceResponseSchema
    );
  }
}
