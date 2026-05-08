import { randomUUID } from "node:crypto";
import { pool, withTransaction } from "../db/client.js";
function nowIso() {
    return new Date().toISOString();
}
function mapUser(row) {
    return {
        userId: String(row.user_id),
        type: row.user_type === "registered" ? "registered" : "guest",
        displayName: String(row.display_name),
        email: row.email ? String(row.email) : undefined
    };
}
function mapParticipant(row) {
    const settings = (row.settings ?? {});
    return {
        participantId: String(row.participant_id),
        identity: String(row.identity),
        role: (row.role === "host" ? "host" : "guest"),
        userId: String(row.user_id),
        joinedAt: new Date(String(row.joined_at)).toISOString(),
        settings
    };
}
function mapRoom(row) {
    return {
        roomId: String(row.room_id),
        roomCode: String(row.room_code),
        sessionId: String(row.session_id),
        hostParticipantId: String(row.host_participant_id),
        guestParticipantId: row.guest_participant_id ? String(row.guest_participant_id) : undefined,
        status: row.status ?? "waiting",
        createdAt: new Date(String(row.created_at)).toISOString(),
        endedAt: row.ended_at ? new Date(String(row.ended_at)).toISOString() : undefined,
        providerProfile: String(row.provider_profile),
        supportedLanguages: Array.isArray(row.supported_languages) ? row.supported_languages : []
    };
}
async function ensureUser(client, userId, type, displayName) {
    await client.query(`
      INSERT INTO users(user_id, user_type, display_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO NOTHING
    `, [userId, type, displayName]);
}
function generateRoomCode() {
    const random = Math.floor(Math.random() * 1_000_000);
    return String(random).padStart(6, "0");
}
export const persistence = {
    async createGuest(displayName) {
        const userId = `guest_${randomUUID()}`;
        return withTransaction(async (client) => {
            await client.query("INSERT INTO users(user_id, user_type, display_name) VALUES ($1, 'guest', $2)", [userId, displayName]);
            return { userId, type: "guest", displayName };
        });
    },
    async registerRegisteredUser(input) {
        const userId = `user_${randomUUID()}`;
        const userRow = await pool.query(`
        INSERT INTO users(user_id, user_type, display_name, email, password_hash, password_salt)
        VALUES ($1, 'registered', $2, $3, $4, $5)
        RETURNING user_id, user_type, display_name, email
      `, [userId, input.displayName, input.email.toLowerCase(), input.passwordHash, input.passwordSalt]);
        return mapUser(userRow.rows[0]);
    },
    async loginRegisteredUser(input) {
        const result = await pool.query(`
        SELECT user_id, user_type, display_name, email, password_hash, password_salt
        FROM users
        WHERE user_type = 'registered' AND LOWER(email) = LOWER($1)
        LIMIT 1
      `, [input.email]);
        if ((result.rowCount ?? 0) === 0) {
            return undefined;
        }
        return {
            user: mapUser(result.rows[0]),
            passwordHash: String(result.rows[0].password_hash ?? ""),
            passwordSalt: String(result.rows[0].password_salt ?? "")
        };
    },
    async createAuthSession(userId, accessToken) {
        const sessionRow = await pool.query("INSERT INTO auth_sessions(access_token, user_id) VALUES ($1, $2) RETURNING access_token, user_id, created_at", [accessToken, userId]);
        return {
            accessToken: String(sessionRow.rows[0].access_token),
            userId: String(sessionRow.rows[0].user_id),
            createdAt: new Date(String(sessionRow.rows[0].created_at)).toISOString()
        };
    },
    async deleteAuthSession(accessToken) {
        const result = await pool.query(`
        UPDATE auth_sessions
        SET revoked_at = NOW()
        WHERE access_token = $1 AND revoked_at IS NULL
      `, [accessToken]);
        return (result.rowCount ?? 0) > 0;
    },
    async getActiveAuthSession(accessToken) {
        const result = await pool.query(`
        SELECT access_token, user_id, created_at
        FROM auth_sessions
        WHERE access_token = $1 AND revoked_at IS NULL
        LIMIT 1
      `, [accessToken]);
        if ((result.rowCount ?? 0) === 0) {
            return undefined;
        }
        return {
            accessToken: String(result.rows[0].access_token),
            userId: String(result.rows[0].user_id),
            createdAt: new Date(String(result.rows[0].created_at)).toISOString()
        };
    },
    async createRoom(input) {
        const roomId = `room_${randomUUID()}`;
        const sessionId = `session_${randomUUID()}`;
        const hostParticipantId = `participant_${randomUUID()}`;
        return withTransaction(async (client) => {
            await ensureUser(client, input.hostUserId, input.hostUserType, input.hostIdentity);
            let roomCode = "";
            let codeReady = false;
            for (let attempt = 0; attempt < 20; attempt += 1) {
                roomCode = generateRoomCode();
                const exists = await client.query("SELECT 1 FROM rooms WHERE room_code = $1 LIMIT 1", [roomCode]);
                if ((exists.rowCount ?? 0) === 0) {
                    codeReady = true;
                    break;
                }
            }
            if (!codeReady) {
                throw new Error("room_code_generation_failed");
            }
            await client.query(`
          INSERT INTO rooms(
            room_id, room_code, session_id, host_participant_id, status, provider_profile, supported_languages
          ) VALUES ($1, $2, $3, $4, 'waiting', $5, $6::jsonb)
        `, [roomId, roomCode, sessionId, hostParticipantId, input.providerProfile, JSON.stringify(input.supportedLanguages)]);
            const participantRow = await client.query(`
          INSERT INTO participants(participant_id, room_id, identity, role, user_id, settings)
          VALUES ($1, $2, $3, 'host', $4, $5::jsonb)
          RETURNING participant_id, identity, role, user_id, settings, joined_at
        `, [hostParticipantId, roomId, input.hostIdentity, input.hostUserId, JSON.stringify(input.hostSettings)]);
            const roomRow = await client.query(`
          SELECT room_id, room_code, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
          FROM rooms WHERE room_id = $1
        `, [roomId]);
            return {
                room: mapRoom(roomRow.rows[0]),
                hostParticipant: mapParticipant(participantRow.rows[0])
            };
        });
    },
    async getRoom(roomId) {
        const result = await pool.query(`
        SELECT room_id, room_code, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
        FROM rooms
        WHERE room_id = $1
      `, [roomId]);
        if ((result.rowCount ?? 0) === 0) {
            return undefined;
        }
        return mapRoom(result.rows[0]);
    },
    async getRoomByShortCode(shortCode) {
        const normalized = shortCode.trim().toLowerCase();
        const result = await pool.query(`
        SELECT room_id, room_code, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
        FROM rooms
        WHERE room_code = $1 AND status <> 'closed'
        ORDER BY created_at DESC
        LIMIT 1
      `, [normalized]);
        if ((result.rowCount ?? 0) === 0) {
            return undefined;
        }
        return mapRoom(result.rows[0]);
    },
    async listOpenRoomsCreatedBefore(cutoffIso, limit = 200) {
        const boundedLimit = Math.max(1, Math.min(1000, limit));
        const result = await pool.query(`
        SELECT room_id, room_code, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
        FROM rooms
        WHERE status <> 'closed' AND created_at <= $1::timestamptz
        ORDER BY created_at ASC
        LIMIT $2
      `, [cutoffIso, boundedLimit]);
        return result.rows.map((row) => mapRoom(row));
    },
    async joinRoom(input) {
        return withTransaction(async (client) => {
            const roomResult = await client.query(`
          SELECT room_id, room_code, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
          FROM rooms
          WHERE room_id = $1
          FOR UPDATE
        `, [input.roomId]);
            if ((roomResult.rowCount ?? 0) === 0) {
                throw new Error("room_not_found");
            }
            const room = mapRoom(roomResult.rows[0]);
            if (room.status === "closed") {
                throw new Error("room_ended");
            }
            if (room.guestParticipantId) {
                throw new Error("room_already_has_guest");
            }
            await ensureUser(client, input.guestUserId, "guest", input.guestIdentity);
            const guestParticipantId = `participant_${randomUUID()}`;
            const participantRow = await client.query(`
          INSERT INTO participants(participant_id, room_id, identity, role, user_id, settings)
          VALUES ($1, $2, $3, 'guest', $4, $5::jsonb)
          RETURNING participant_id, identity, role, user_id, settings, joined_at
        `, [guestParticipantId, input.roomId, input.guestIdentity, input.guestUserId, JSON.stringify(input.guestSettings)]);
            const updatedRoomResult = await client.query(`
          UPDATE rooms
          SET guest_participant_id = $1, status = 'active', created_at = NOW()
          WHERE room_id = $2
          RETURNING room_id, room_code, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
        `, [guestParticipantId, input.roomId]);
            return {
                room: mapRoom(updatedRoomResult.rows[0]),
                guestParticipant: mapParticipant(participantRow.rows[0])
            };
        });
    },
    async endRoom(roomId) {
        return withTransaction(async (client) => {
            const roomRow = await client.query(`
          SELECT room_id, room_code, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
          FROM rooms
          WHERE room_id = $1
          FOR UPDATE
        `, [roomId]);
            if ((roomRow.rowCount ?? 0) === 0) {
                throw new Error("room_not_found");
            }
            const current = mapRoom(roomRow.rows[0]);
            if (current.status === "closed") {
                return current;
            }
            const updated = await client.query(`
          UPDATE rooms
          SET status = 'closed', ended_at = NOW()
          WHERE room_id = $1
          RETURNING room_id, room_code, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
        `, [roomId]);
            return mapRoom(updated.rows[0]);
        });
    },
    async leaveParticipant(roomId, participantId) {
        return withTransaction(async (client) => {
            const roomRow = await client.query(`
          SELECT room_id, room_code, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
          FROM rooms
          WHERE room_id = $1
          FOR UPDATE
        `, [roomId]);
            if ((roomRow.rowCount ?? 0) === 0) {
                throw new Error("room_not_found");
            }
            const current = mapRoom(roomRow.rows[0]);
            if (current.status === "closed") {
                throw new Error("room_ended");
            }
            const participantRow = await client.query(`
          SELECT participant_id, identity, role, user_id, settings, joined_at
          FROM participants
          WHERE room_id = $1 AND participant_id = $2
        `, [roomId, participantId]);
            if ((participantRow.rowCount ?? 0) === 0) {
                throw new Error("participant_not_found");
            }
            const participant = mapParticipant(participantRow.rows[0]);
            if (participant.role === "host") {
                throw new Error("host_must_end_room");
            }
            const updatedRoomRow = await client.query(`
          UPDATE rooms
          SET guest_participant_id = NULL, status = 'waiting'
          WHERE room_id = $1
          RETURNING room_id, room_code, session_id, host_participant_id, guest_participant_id, status, provider_profile, supported_languages, created_at, ended_at
        `, [roomId]);
            return {
                room: mapRoom(updatedRoomRow.rows[0]),
                participant
            };
        });
    },
    async updateParticipantSettings(roomId, participantId, settings) {
        const room = await this.getRoom(roomId);
        if (!room) {
            throw new Error("room_not_found");
        }
        const payload = JSON.stringify(settings);
        const result = await pool.query(`
        UPDATE participants
        SET settings = settings || $3::jsonb
        WHERE room_id = $1 AND participant_id = $2
        RETURNING participant_id, identity, role, user_id, settings, joined_at
      `, [roomId, participantId, payload]);
        if ((result.rowCount ?? 0) === 0) {
            throw new Error("participant_not_found");
        }
        return mapParticipant(result.rows[0]);
    },
    async getParticipantById(participantId) {
        const result = await pool.query(`
        SELECT participant_id, identity, role, user_id, settings, joined_at
        FROM participants
        WHERE participant_id = $1
      `, [participantId]);
        if ((result.rowCount ?? 0) === 0) {
            return undefined;
        }
        return mapParticipant(result.rows[0]);
    },
    async recordWorkerEvent(event) {
        await pool.query("INSERT INTO worker_events(payload) VALUES ($1::jsonb)", [JSON.stringify(event)]);
        const isTranscriptEvent = event.type === "subtitle.final" ||
            event.type === "translation.final" ||
            event.type === "warning" ||
            event.type === "error";
        const hasTranscriptKeys = typeof event.utterance_id === "string" &&
            typeof event.speaker_identity === "string" &&
            typeof event.source_lang === "string" &&
            typeof event.target_lang === "string";
        if (!isTranscriptEvent || !hasTranscriptKeys) {
            return;
        }
        try {
            await pool.query(`
            INSERT INTO transcript_items(
              room_id, session_id, conversation_id, title, title_updated_at, utterance_id, speaker_identity, source_lang, target_lang, source_text, translated_text, event_type
            )
            VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (session_id, utterance_id, event_type) DO NOTHING
          `, [
                event.room_id,
                event.session_id,
                event.session_id,
                `Conversation ${event.session_id.slice(-6)}`,
                event.utterance_id,
                event.speaker_identity,
                event.source_lang,
                event.target_lang,
                event.text ?? null,
                event.translated_text ?? null,
                event.type
            ]);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[worker:event] transcript_insert_skipped room=${event.room_id} session=${event.session_id} reason=${message}`);
        }
    },
    async listWorkerEvents(limit = 100) {
        const boundedLimit = Math.max(1, Math.min(500, limit));
        const result = await pool.query(`
        SELECT payload, received_at
        FROM worker_events
        ORDER BY id DESC
        LIMIT $1
      `, [boundedLimit]);
        return result.rows
            .reverse()
            .map((row) => ({ ...row.payload, received_at: new Date(String(row.received_at)).toISOString() }));
    },
    async listHistory(input) {
        const boundedLimit = Math.max(1, Math.min(500, input.limit ?? 100));
        const clauses = [];
        const params = [];
        if (input.roomId) {
            params.push(input.roomId);
            clauses.push(`room_id = $${params.length}`);
        }
        if (input.sessionId) {
            params.push(input.sessionId);
            clauses.push(`session_id = $${params.length}`);
        }
        if (input.userId) {
            params.push(input.userId);
            clauses.push(`EXISTS (
          SELECT 1
          FROM rooms r
          JOIN participants p ON p.room_id = r.room_id
          WHERE r.session_id = transcript_items.session_id
            AND p.user_id = $${params.length}
        )`);
        }
        params.push(boundedLimit);
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const query = `
      SELECT
        id,
        room_id,
        session_id,
        conversation_id,
        title,
        title_updated_at,
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
            conversation_id: String(row.conversation_id),
            title: String(row.title),
            title_updated_at: new Date(String(row.title_updated_at)).toISOString(),
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
    async getHistoryItemById(id) {
        const result = await pool.query(`
        SELECT
          id,
        room_id,
        session_id,
        conversation_id,
        title,
        title_updated_at,
        utterance_id,
          speaker_identity,
          source_lang,
          target_lang,
          source_text,
          translated_text,
          event_type,
          created_at
        FROM transcript_items
        WHERE id = $1
        LIMIT 1
      `, [id]);
        if ((result.rowCount ?? 0) === 0) {
            return undefined;
        }
        const row = result.rows[0];
        return {
            id: Number(row.id),
            room_id: String(row.room_id),
            session_id: String(row.session_id),
            conversation_id: String(row.conversation_id),
            title: String(row.title),
            title_updated_at: new Date(String(row.title_updated_at)).toISOString(),
            utterance_id: String(row.utterance_id),
            speaker_identity: String(row.speaker_identity),
            source_lang: String(row.source_lang),
            target_lang: String(row.target_lang),
            source_text: row.source_text ? String(row.source_text) : null,
            translated_text: row.translated_text ? String(row.translated_text) : null,
            event_type: String(row.event_type),
            created_at: new Date(String(row.created_at)).toISOString()
        };
    },
    async userHasSessionAccess(userId, sessionId) {
        const result = await pool.query(`
        SELECT 1
        FROM rooms r
        JOIN participants p ON p.room_id = r.room_id
        WHERE r.session_id = $1 AND p.user_id = $2
        LIMIT 1
      `, [sessionId, userId]);
        return (result.rowCount ?? 0) > 0;
    },
    async deleteHistoryItem(id) {
        const result = await pool.query("DELETE FROM transcript_items WHERE id = $1", [id]);
        return (result.rowCount ?? 0) > 0;
    },
    async deleteHistoryBySession(sessionId) {
        const result = await pool.query("DELETE FROM transcript_items WHERE session_id = $1", [sessionId]);
        return result.rowCount ?? 0;
    },
    async deleteAllHistory() {
        const result = await pool.query("DELETE FROM transcript_items");
        return result.rowCount ?? 0;
    },
    async syncHistoryItems(items) {
        if (!items.length)
            return 0;
        let inserted = 0;
        await withTransaction(async (client) => {
            for (const item of items) {
                const result = await client.query(`
            INSERT INTO transcript_items(
              room_id, session_id, conversation_id, title, title_updated_at, utterance_id, speaker_identity, source_lang, target_lang, source_text, translated_text, event_type, created_at
            )
            VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamptz, NOW()))
            ON CONFLICT (session_id, utterance_id, event_type) DO NOTHING
          `, [
                    item.room_id,
                    item.session_id,
                    item.conversation_id,
                    item.title,
                    item.title_updated_at,
                    item.utterance_id,
                    item.speaker_identity,
                    item.source_lang,
                    item.target_lang,
                    item.source_text ?? null,
                    item.translated_text ?? null,
                    item.event_type,
                    item.created_at ?? null
                ]);
                inserted += result.rowCount ?? 0;
            }
        });
        return inserted;
    },
    async renameConversationTitle(input) {
        const result = await pool.query(`
        UPDATE transcript_items
        SET
          title = $2,
          title_updated_at = COALESCE($3::timestamptz, NOW())
        WHERE conversation_id = $1
        RETURNING conversation_id, title, title_updated_at
      `, [input.conversationId, input.title, input.titleUpdatedAt ?? null]);
        if ((result.rowCount ?? 0) === 0) {
            return undefined;
        }
        return {
            conversation_id: String(result.rows[0].conversation_id),
            title: String(result.rows[0].title),
            title_updated_at: new Date(String(result.rows[0].title_updated_at)).toISOString()
        };
    },
    async getConversationSessionId(conversationId) {
        const result = await pool.query(`
        SELECT session_id
        FROM transcript_items
        WHERE conversation_id = $1
        ORDER BY id DESC
        LIMIT 1
      `, [conversationId]);
        if ((result.rowCount ?? 0) === 0) {
            return undefined;
        }
        return String(result.rows[0].session_id);
    },
    async upsertVoicePreference(input) {
        return withTransaction(async (client) => {
            const userResult = await client.query("SELECT user_id, user_type FROM users WHERE user_id = $1", [input.userId]);
            if ((userResult.rowCount ?? 0) === 0) {
                throw new Error("user_not_found");
            }
            const userType = String(userResult.rows[0].user_type);
            if (userType !== "registered") {
                throw new Error("user_not_registered");
            }
            const upsert = await client.query(`
          INSERT INTO voice_preferences(user_id, settings, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET settings = voice_preferences.settings || EXCLUDED.settings, updated_at = NOW()
          RETURNING user_id, settings, updated_at
        `, [input.userId, JSON.stringify(input.settings)]);
            return {
                user_id: String(upsert.rows[0].user_id),
                settings: upsert.rows[0].settings ?? {},
                updated_at: new Date(String(upsert.rows[0].updated_at)).toISOString(),
            };
        });
    }
};
