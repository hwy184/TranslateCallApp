import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../db/client.js";
import type { AuthSession, Participant, ParticipantRole, ParticipantSettings, Room, User } from "../types/domain.js";
import type { HistoryItem, VoicePreference, WorkerEventPayload } from "../types/worker-event.js";

function nowIso() {
  return new Date().toISOString();
}

function mapUser(row: Record<string, unknown>): User {
  return {
    userId: String(row.user_id),
    type: row.user_type === "registered" ? "registered" : "guest",
    displayName: String(row.display_name)
  };
}

function mapParticipant(row: Record<string, unknown>): Participant {
  const settings = (row.settings ?? {}) as ParticipantSettings;
  return {
    participantId: String(row.participant_id),
    identity: String(row.identity),
    role: (row.role === "host" ? "host" : "guest") as ParticipantRole,
    userId: String(row.user_id),
    joinedAt: new Date(String(row.joined_at)).toISOString(),
    settings
  };
}

function mapRoom(row: Record<string, unknown>): Room {
  return {
    roomId: String(row.room_id),
    sessionId: String(row.session_id),
    hostParticipantId: String(row.host_participant_id),
    guestParticipantId: row.guest_participant_id ? String(row.guest_participant_id) : undefined,
    status: (row.status as Room["status"]) ?? "waiting_guest",
    createdAt: new Date(String(row.created_at)).toISOString(),
    endedAt: row.ended_at ? new Date(String(row.ended_at)).toISOString() : undefined,
    providerProfile: String(row.provider_profile),
    supportedLanguages: Array.isArray(row.supported_languages) ? (row.supported_languages as string[]) : []
  };
}

async function ensureUser(client: PoolClient, userId: string, type: "guest" | "registered", displayName: string) {
  await client.query(
    `
      INSERT INTO users(user_id, user_type, display_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId, type, displayName]
  );
}

export const persistence = {
  async createGuest(displayName: string): Promise<{ user: User; session: AuthSession }> {
    const userId = `guest_${randomUUID()}`;
    const accessToken = `local_${randomUUID()}`;

    return withTransaction(async (client) => {
      await client.query(
        "INSERT INTO users(user_id, user_type, display_name) VALUES ($1, 'guest', $2)",
        [userId, displayName]
      );
      const sessionRow = await client.query(
        "INSERT INTO auth_sessions(access_token, user_id) VALUES ($1, $2) RETURNING access_token, created_at",
        [accessToken, userId]
      );

      return {
        user: { userId, type: "guest", displayName },
        session: {
          accessToken,
          userId,
          createdAt: new Date(String(sessionRow.rows[0].created_at)).toISOString()
        }
      };
    });
  },

  async createRegisteredSession(username: string): Promise<{ user: User; session: AuthSession }> {
    const accessToken = `local_${randomUUID()}`;

    return withTransaction(async (client) => {
      const userRow = await client.query(
        `
          INSERT INTO users(user_id, user_type, display_name, username)
          VALUES ($1, 'registered', $2, $3)
          ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
          RETURNING user_id, user_type, display_name
        `,
        [`user_${randomUUID()}`, username, username]
      );

      const user = mapUser(userRow.rows[0]);
      const sessionRow = await client.query(
        "INSERT INTO auth_sessions(access_token, user_id) VALUES ($1, $2) RETURNING access_token, created_at",
        [accessToken, user.userId]
      );

      return {
        user,
        session: {
          accessToken,
          userId: user.userId,
          createdAt: new Date(String(sessionRow.rows[0].created_at)).toISOString()
        }
      };
    });
  },

  async deleteAuthSession(accessToken: string): Promise<boolean> {
    const result = await pool.query(
      `
        UPDATE auth_sessions
        SET revoked_at = NOW()
        WHERE access_token = $1 AND revoked_at IS NULL
      `,
      [accessToken]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async createRoom(input: {
    hostUserId: string;
    hostIdentity: string;
    hostSettings: ParticipantSettings;
    providerProfile: string;
    supportedLanguages: string[];
  }): Promise<{ room: Room; hostParticipant: Participant }> {
    const roomId = `room_${randomUUID()}`;
    const sessionId = `session_${randomUUID()}`;
    const hostParticipantId = `participant_${randomUUID()}`;

    return withTransaction(async (client) => {
      await ensureUser(client, input.hostUserId, "registered", input.hostIdentity);

      await client.query(
        `
          INSERT INTO rooms(
            room_id, session_id, host_participant_id, status, provider_profile, supported_languages
          ) VALUES ($1, $2, $3, 'waiting_guest', $4, $5::jsonb)
        `,
        [roomId, sessionId, hostParticipantId, input.providerProfile, JSON.stringify(input.supportedLanguages)]
      );

      const participantRow = await client.query(
        `
          INSERT INTO participants(participant_id, room_id, identity, role, user_id, settings)
          VALUES ($1, $2, $3, 'host', $4, $5::jsonb)
          RETURNING participant_id, identity, role, user_id, settings, joined_at
        `,
        [hostParticipantId, roomId, input.hostIdentity, input.hostUserId, JSON.stringify(input.hostSettings)]
      );

      const roomRow = await client.query(
        `
          SELECT room_id, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
          FROM rooms WHERE room_id = $1
        `,
        [roomId]
      );

      return {
        room: mapRoom(roomRow.rows[0]),
        hostParticipant: mapParticipant(participantRow.rows[0])
      };
    });
  },

  async getRoom(roomId: string): Promise<Room | undefined> {
    const result = await pool.query(
      `
        SELECT room_id, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
        FROM rooms
        WHERE room_id = $1
      `,
      [roomId]
    );
    if ((result.rowCount ?? 0) === 0) {
      return undefined;
    }
    return mapRoom(result.rows[0]);
  },

  async joinRoom(input: {
    roomId: string;
    guestUserId: string;
    guestIdentity: string;
    guestSettings: ParticipantSettings;
  }): Promise<{ room: Room; guestParticipant: Participant }> {
    return withTransaction(async (client) => {
      const roomResult = await client.query(
        `
          SELECT room_id, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
          FROM rooms
          WHERE room_id = $1
          FOR UPDATE
        `,
        [input.roomId]
      );

      if ((roomResult.rowCount ?? 0) === 0) {
        throw new Error("room_not_found");
      }

      const room = mapRoom(roomResult.rows[0]);
      if (room.status === "ended") {
        throw new Error("room_ended");
      }
      if (room.guestParticipantId) {
        throw new Error("room_already_has_guest");
      }

      await ensureUser(client, input.guestUserId, "guest", input.guestIdentity);
      const guestParticipantId = `participant_${randomUUID()}`;
      const participantRow = await client.query(
        `
          INSERT INTO participants(participant_id, room_id, identity, role, user_id, settings)
          VALUES ($1, $2, $3, 'guest', $4, $5::jsonb)
          RETURNING participant_id, identity, role, user_id, settings, joined_at
        `,
        [guestParticipantId, input.roomId, input.guestIdentity, input.guestUserId, JSON.stringify(input.guestSettings)]
      );

      const updatedRoomResult = await client.query(
        `
          UPDATE rooms
          SET guest_participant_id = $1, status = 'active'
          WHERE room_id = $2
          RETURNING room_id, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
        `,
        [guestParticipantId, input.roomId]
      );

      return {
        room: mapRoom(updatedRoomResult.rows[0]),
        guestParticipant: mapParticipant(participantRow.rows[0])
      };
    });
  },

  async endRoom(roomId: string): Promise<Room> {
    return withTransaction(async (client) => {
      const roomRow = await client.query(
        `
          SELECT room_id, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
          FROM rooms
          WHERE room_id = $1
          FOR UPDATE
        `,
        [roomId]
      );
      if ((roomRow.rowCount ?? 0) === 0) {
        throw new Error("room_not_found");
      }

      const current = mapRoom(roomRow.rows[0]);
      if (current.status === "ended") {
        return current;
      }

      const updated = await client.query(
        `
          UPDATE rooms
          SET status = 'ended', ended_at = NOW()
          WHERE room_id = $1
          RETURNING room_id, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
        `,
        [roomId]
      );
      return mapRoom(updated.rows[0]);
    });
  },

  async updateParticipantSettings(
    roomId: string,
    participantId: string,
    settings: Partial<ParticipantSettings>
  ): Promise<Participant> {
    const room = await this.getRoom(roomId);
    if (!room) {
      throw new Error("room_not_found");
    }

    const payload = JSON.stringify(settings);
    const result = await pool.query(
      `
        UPDATE participants
        SET settings = settings || $3::jsonb
        WHERE room_id = $1 AND participant_id = $2
        RETURNING participant_id, identity, role, user_id, settings, joined_at
      `,
      [roomId, participantId, payload]
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error("participant_not_found");
    }
    return mapParticipant(result.rows[0]);
  },

  async getParticipantById(participantId: string): Promise<Participant | undefined> {
    const result = await pool.query(
      `
        SELECT participant_id, identity, role, user_id, settings, joined_at
        FROM participants
        WHERE participant_id = $1
      `,
      [participantId]
    );
    if ((result.rowCount ?? 0) === 0) {
      return undefined;
    }
    return mapParticipant(result.rows[0]);
  },

  async recordWorkerEvent(event: WorkerEventPayload): Promise<void> {
    await withTransaction(async (client) => {
      await client.query("INSERT INTO worker_events(payload) VALUES ($1::jsonb)", [JSON.stringify(event)]);

      const isTranscriptEvent = event.type === "subtitle.final" || event.type === "translation.final" || event.type === "warning" || event.type === "error";
      const hasTranscriptKeys =
        typeof event.utterance_id === "string" &&
        typeof event.speaker_identity === "string" &&
        typeof event.source_lang === "string" &&
        typeof event.target_lang === "string";

      if (!isTranscriptEvent || !hasTranscriptKeys) {
        return;
      }

      await client.query(
        `
          INSERT INTO transcript_items(
            room_id, session_id, utterance_id, speaker_identity, source_lang, target_lang, source_text, translated_text, event_type
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          event.room_id,
          event.session_id,
          event.utterance_id,
          event.speaker_identity,
          event.source_lang,
          event.target_lang,
          event.text ?? null,
          event.translated_text ?? null,
          event.type
        ]
      );
    });
  },

  async listWorkerEvents(limit = 100): Promise<Array<Record<string, unknown>>> {
    const boundedLimit = Math.max(1, Math.min(500, limit));
    const result = await pool.query(
      `
        SELECT payload, received_at
        FROM worker_events
        ORDER BY id DESC
        LIMIT $1
      `,
      [boundedLimit]
    );

    return result.rows
      .reverse()
      .map((row) => ({ ...(row.payload as Record<string, unknown>), received_at: new Date(String(row.received_at)).toISOString() }));
  },

  async listHistory(input: { roomId?: string; sessionId?: string; limit?: number }): Promise<HistoryItem[]> {
    const boundedLimit = Math.max(1, Math.min(500, input.limit ?? 100));
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (input.roomId) {
      params.push(input.roomId);
      clauses.push(`room_id = $${params.length}`);
    }
    if (input.sessionId) {
      params.push(input.sessionId);
      clauses.push(`session_id = $${params.length}`);
    }

    params.push(boundedLimit);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const query = `
      SELECT
        id,
        room_id,
        session_id,
        utterance_id,
        speaker_identity,
        source_lang,
        target_lang,
        source_text,
        translated_text,
        event_type,
        created_at
      FROM transcript_items
      ${where}
      ORDER BY id DESC
      LIMIT $${params.length}
    `;

    const result = await pool.query(query, params);
    return result.rows.map((row) => ({
      id: Number(row.id),
      room_id: String(row.room_id),
      session_id: String(row.session_id),
      utterance_id: String(row.utterance_id),
      speaker_identity: String(row.speaker_identity),
      source_lang: String(row.source_lang),
      target_lang: String(row.target_lang),
      source_text: row.source_text ? String(row.source_text) : null,
      translated_text: row.translated_text ? String(row.translated_text) : null,
      event_type: String(row.event_type),
      created_at: new Date(String(row.created_at)).toISOString()
    }));
  },

  async deleteHistoryItem(id: number): Promise<boolean> {
    const result = await pool.query("DELETE FROM transcript_items WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async upsertVoicePreference(input: {
    userId: string;
    settings: Record<string, unknown>;
  }): Promise<VoicePreference> {
    return withTransaction(async (client) => {
      const userResult = await client.query(
        "SELECT user_id, user_type FROM users WHERE user_id = $1",
        [input.userId]
      );
      if ((userResult.rowCount ?? 0) === 0) {
        throw new Error("user_not_found");
      }

      const userType = String(userResult.rows[0].user_type);
      if (userType !== "registered") {
        throw new Error("user_not_registered");
      }

      const upsert = await client.query(
        `
          INSERT INTO voice_preferences(user_id, settings, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET settings = voice_preferences.settings || EXCLUDED.settings, updated_at = NOW()
          RETURNING user_id, settings, updated_at
        `,
        [input.userId, JSON.stringify(input.settings)]
      );

      return {
        user_id: String(upsert.rows[0].user_id),
        settings: (upsert.rows[0].settings as Record<string, unknown>) ?? {},
        updated_at: new Date(String(upsert.rows[0].updated_at)).toISOString(),
      };
    });
  }
};
