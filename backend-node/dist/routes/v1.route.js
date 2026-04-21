import { Router } from "express";
import { z } from "zod";
import { createLivekitToken } from "../services/livekit-token.js";
import { persistence } from "../services/persistence.js";
import { startWorkerSession, stopWorkerSession } from "../services/worker-client.js";
import { ERROR_CODES, sendError } from "../types/api-error.js";
const v1Router = Router();
const defaultSettingsSchema = z.object({
    source_language: z.string().min(2).default("vi"),
    target_language: z.string().min(2).default("en"),
    voice_profile: z.string().min(1).default("default")
});
const roomCreateSchema = z.object({
    host_user_id: z.string().min(1),
    host_identity: z.string().min(1),
    host_display_name: z.string().min(1),
    provider_profile: z.string().min(1).default("gemini-first"),
    supported_languages: z.array(z.string().min(2)).min(2).default(["vi", "en"]),
    host_settings: defaultSettingsSchema.default({
        source_language: "vi",
        target_language: "en",
        voice_profile: "host-default"
    })
});
const roomJoinSchema = z.object({
    room_id: z.string().min(1),
    guest_user_id: z.string().min(1),
    guest_identity: z.string().min(1),
    guest_display_name: z.string().min(1),
    guest_settings: defaultSettingsSchema.default({
        source_language: "en",
        target_language: "vi",
        voice_profile: "guest-default"
    })
});
const authGuestSchema = z.object({
    display_name: z.string().min(1).default("Guest User")
});
const authLoginSchema = z.object({
    username: z.string().min(1)
});
const authLogoutSchema = z.object({
    access_token: z.string().min(1)
});
const patchSettingsSchema = z.object({
    source_language: z.string().min(2).optional(),
    target_language: z.string().min(2).optional(),
    voice_profile: z.string().min(1).optional()
});
const voicePreferenceSchema = z.object({
    user_id: z.string().min(1),
    speed: z.number().min(0.5).max(2).optional(),
    gender: z.enum(["male", "female", "neutral"]).optional(),
    profile: z.string().min(1).optional()
});
const historyQuerySchema = z.object({
    room_id: z.string().min(1).optional(),
    session_id: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(500).default(100)
});
const workerEventSchema = z
    .object({
    type: z.enum([
        "subtitle.partial",
        "subtitle.final",
        "translation.final",
        "session.state",
        "participant.state",
        "warning",
        "error"
    ]),
    session_id: z.string().min(1),
    room_id: z.string().min(1),
    timestamp: z.string().datetime({ offset: true }),
    utterance_id: z.string().min(1).optional(),
    speaker_identity: z.string().min(1).optional(),
    source_lang: z.string().min(2).optional(),
    target_lang: z.string().min(2).optional(),
    text: z.string().optional(),
    translated_text: z.string().optional(),
    details: z.record(z.unknown()).optional()
})
    .superRefine((event, ctx) => {
    const needsUtteranceFields = event.type === "subtitle.final" || event.type === "translation.final";
    if (needsUtteranceFields) {
        if (!event.utterance_id) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["utterance_id"], message: "utterance_id is required for subtitle/translation events" });
        }
        if (!event.speaker_identity) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["speaker_identity"], message: "speaker_identity is required for subtitle/translation events" });
        }
        if (!event.source_lang) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["source_lang"], message: "source_lang is required for subtitle/translation events" });
        }
        if (!event.target_lang) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["target_lang"], message: "target_lang is required for subtitle/translation events" });
        }
    }
    if (event.type === "translation.final" && !event.translated_text) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["translated_text"], message: "translated_text is required for translation.final" });
    }
});
function participantMetadata(role, identity, settings) {
    return {
        role,
        identity,
        source_language: settings.source_language,
        target_language: settings.target_language,
        voice_profile: settings.voice_profile
    };
}
function roomMetadata(sessionId, providerProfile, supportedLanguages) {
    return {
        session_id: sessionId,
        mode: "bidirectional",
        audio_mode: "translated_only",
        supported_languages: supportedLanguages,
        provider_profile: providerProfile
    };
}
function roomShortCode(roomId) {
    return roomId.replace(/^room_/, "").slice(-8);
}
v1Router.post("/auth/guest", async (req, res) => {
    try {
        const payload = authGuestSchema.parse(req.body);
        const result = await persistence.createGuest(payload.display_name);
        res.status(201).json({
            user: result.user,
            session: result.session
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "create_guest_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Create guest failed", message);
    }
});
v1Router.post("/auth/login", async (req, res) => {
    try {
        const payload = authLoginSchema.parse(req.body);
        const result = await persistence.createRegisteredSession(payload.username);
        res.status(200).json({
            user: result.user,
            session: result.session
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "login_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Login failed", message);
    }
});
v1Router.post("/auth/logout", async (req, res) => {
    try {
        const payload = authLogoutSchema.parse(req.body);
        const removed = await persistence.deleteAuthSession(payload.access_token);
        if (!removed) {
            sendError(res, 404, ERROR_CODES.SESSION_NOT_FOUND, "Auth session was not found");
            return;
        }
        res.status(200).json({ success: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "logout_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Logout failed", message);
    }
});
v1Router.post("/rooms", async (req, res) => {
    try {
        const payload = roomCreateSchema.parse(req.body);
        const created = await persistence.createRoom({
            hostUserId: payload.host_user_id,
            hostIdentity: payload.host_identity,
            hostSettings: payload.host_settings,
            providerProfile: payload.provider_profile,
            supportedLanguages: payload.supported_languages
        });
        const roomMeta = roomMetadata(created.room.sessionId, created.room.providerProfile, created.room.supportedLanguages);
        const participantMeta = participantMetadata("host", payload.host_identity, payload.host_settings);
        const livekitToken = createLivekitToken({
            identity: payload.host_identity,
            name: payload.host_display_name,
            room: created.room.roomId,
            metadata: participantMeta
        });
        res.status(201).json({
            room: created.room,
            room_short_code: roomShortCode(created.room.roomId),
            participant: created.hostParticipant,
            metadata: {
                room: roomMeta,
                participant: participantMeta
            },
            livekit: {
                room_name: created.room.roomId,
                token: livekitToken,
                token_status: livekitToken ? "issued" : "skipped_missing_livekit_credentials"
            }
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "create_room_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Create room failed", message);
    }
});
v1Router.post("/rooms/join", async (req, res) => {
    const payload = roomJoinSchema.parse(req.body);
    try {
        const room = await persistence.getRoom(payload.room_id);
        if (!room) {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        if (room.status === "ended") {
            sendError(res, 409, ERROR_CODES.ROOM_ENDED, "Room has already ended");
            return;
        }
        if (room.guestParticipantId) {
            sendError(res, 409, ERROR_CODES.ROOM_ALREADY_HAS_GUEST, "Room already has a guest participant");
            return;
        }
        const hostParticipant = await persistence.getParticipantById(room.hostParticipantId);
        const participantsPayload = [
            ...(hostParticipant
                ? [
                    {
                        role: "host",
                        identity: hostParticipant.identity,
                        source_language: hostParticipant.settings.source_language,
                        target_language: hostParticipant.settings.target_language,
                        voice_profile: hostParticipant.settings.voice_profile
                    }
                ]
                : []),
            {
                role: "guest",
                identity: payload.guest_identity,
                source_language: payload.guest_settings.source_language,
                target_language: payload.guest_settings.target_language,
                voice_profile: payload.guest_settings.voice_profile
            }
        ];
        await startWorkerSession({
            sessionId: room.sessionId,
            roomId: room.roomId,
            providerProfile: room.providerProfile,
            roomMetadata: {
                mode: "bidirectional",
                audio_mode: "translated_only",
                supported_languages: room.supportedLanguages,
                provider_profile: room.providerProfile
            },
            participants: participantsPayload,
            livekit: {
                worker_identity: `ai_worker_${room.sessionId.slice(0, 8)}`
            }
        });
        let joined;
        try {
            joined = await persistence.joinRoom({
                roomId: payload.room_id,
                guestUserId: payload.guest_user_id,
                guestIdentity: payload.guest_identity,
                guestSettings: payload.guest_settings
            });
        }
        catch (joinError) {
            // Worker already started, so we attempt best-effort rollback.
            await stopWorkerSession(room.sessionId, "join_commit_failed").catch(() => undefined);
            throw joinError;
        }
        const roomMeta = roomMetadata(joined.room.sessionId, joined.room.providerProfile, joined.room.supportedLanguages);
        const participantMeta = participantMetadata("guest", payload.guest_identity, payload.guest_settings);
        const livekitToken = createLivekitToken({
            identity: payload.guest_identity,
            name: payload.guest_display_name,
            room: joined.room.roomId,
            metadata: participantMeta
        });
        res.status(200).json({
            room: joined.room,
            room_short_code: roomShortCode(joined.room.roomId),
            participant: joined.guestParticipant,
            metadata: {
                room: roomMeta,
                participant: participantMeta
            },
            worker_session: {
                session_id: joined.room.sessionId,
                state: "started",
                participants: participantsPayload.length
            },
            livekit: {
                room_name: joined.room.roomId,
                token: livekitToken,
                token_status: livekitToken ? "issued" : "skipped_missing_livekit_credentials"
            }
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "join_failed";
        if (message === "room_not_found") {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        if (message === "room_ended" || message === "room_already_has_guest") {
            const code = message === "room_ended" ? ERROR_CODES.ROOM_ENDED : ERROR_CODES.ROOM_ALREADY_HAS_GUEST;
            sendError(res, 409, code, message);
            return;
        }
        if (message.startsWith("worker_start_failed")) {
            sendError(res, 502, ERROR_CODES.WORKER_START_FAILED, "Worker session start failed", message);
            return;
        }
        sendError(res, 500, ERROR_CODES.JOIN_FAILED, "Join room failed", message);
    }
});
v1Router.get("/rooms/resolve/:shortCode", async (req, res) => {
    const shortCode = z.string().min(4).max(32).parse(req.params.shortCode);
    try {
        const room = await persistence.getRoomByShortCode(shortCode);
        if (!room) {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        res.status(200).json({
            room,
            room_short_code: roomShortCode(room.roomId)
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "resolve_room_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Resolve room failed", message);
    }
});
v1Router.get("/rooms/:roomId/status", async (req, res) => {
    const roomId = z.string().min(1).parse(req.params.roomId);
    try {
        const room = await persistence.getRoom(roomId);
        if (!room) {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        res.status(200).json({
            room,
            room_short_code: roomShortCode(room.roomId)
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "room_status_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Room status failed", message);
    }
});
v1Router.post("/rooms/:roomId/end", async (req, res) => {
    const roomId = z.string().min(1).parse(req.params.roomId);
    try {
        const room = await persistence.endRoom(roomId);
        const warnings = [];
        await stopWorkerSession(room.sessionId, "room_ended").catch((error) => {
            const message = error instanceof Error ? error.message : "worker_stop_failed";
            warnings.push(message);
            // Best-effort cleanup: room is already ended in backend state.
            // eslint-disable-next-line no-console
            console.warn(`[room:end] worker stop failed for ${room.sessionId}: ${message}`);
        });
        res.status(200).json({
            room,
            worker_session: {
                session_id: room.sessionId,
                state: warnings.length ? "stop_failed_best_effort" : "stopped"
            },
            warnings
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "room_end_failed";
        if (message === "room_not_found") {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        sendError(res, 500, ERROR_CODES.ROOM_END_FAILED, "End room failed", message);
    }
});
v1Router.patch("/rooms/:roomId/participants/:participantId/settings", async (req, res) => {
    const roomId = z.string().min(1).parse(req.params.roomId);
    const participantId = z.string().min(1).parse(req.params.participantId);
    const payload = patchSettingsSchema.parse(req.body);
    try {
        const participant = await persistence.updateParticipantSettings(roomId, participantId, payload);
        res.status(200).json({ participant });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "settings_update_failed";
        if (message === "room_not_found" || message === "participant_not_found") {
            const code = message === "room_not_found" ? ERROR_CODES.ROOM_NOT_FOUND : ERROR_CODES.PARTICIPANT_NOT_FOUND;
            sendError(res, 404, code, message);
            return;
        }
        sendError(res, 500, ERROR_CODES.SETTINGS_UPDATE_FAILED, "Participant settings update failed", message);
    }
});
v1Router.get("/history", async (req, res) => {
    try {
        const query = historyQuerySchema.parse(req.query);
        const items = await persistence.listHistory({
            roomId: query.room_id,
            sessionId: query.session_id,
            limit: query.limit
        });
        res.status(200).json({ items });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, "Invalid history query", error.issues);
            return;
        }
        const message = error instanceof Error ? error.message : "history_list_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "List history failed", message);
    }
});
v1Router.delete("/history/:id", async (req, res) => {
    try {
        const id = z.coerce.number().int().positive().parse(req.params.id);
        const removed = await persistence.deleteHistoryItem(id);
        if (!removed) {
            sendError(res, 404, ERROR_CODES.HISTORY_NOT_FOUND, "History item was not found");
            return;
        }
        res.status(200).json({ deleted: true, id });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, "Invalid history id", error.issues);
            return;
        }
        const message = error instanceof Error ? error.message : "delete_history_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Delete history failed", message);
    }
});
v1Router.put("/me/preferences/voice", async (req, res) => {
    try {
        const payload = voicePreferenceSchema.parse(req.body);
        const settings = {};
        if (payload.speed !== undefined)
            settings.speed = payload.speed;
        if (payload.gender !== undefined)
            settings.gender = payload.gender;
        if (payload.profile !== undefined)
            settings.profile = payload.profile;
        const preference = await persistence.upsertVoicePreference({
            userId: payload.user_id,
            settings
        });
        res.status(200).json({ preference });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, "Invalid voice preference payload", error.issues);
            return;
        }
        const message = error instanceof Error ? error.message : "upsert_voice_preference_failed";
        if (message === "user_not_found") {
            sendError(res, 404, ERROR_CODES.USER_NOT_FOUND, "User was not found");
            return;
        }
        if (message === "user_not_registered") {
            sendError(res, 403, ERROR_CODES.USER_NOT_REGISTERED, "Guest users cannot sync cloud voice preferences");
            return;
        }
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Update voice preference failed", message);
    }
});
v1Router.post("/translate/text", (_req, res) => {
    sendError(res, 501, ERROR_CODES.NOT_IMPLEMENTED, "POST /translate/text is planned after voice-room core");
});
v1Router.post("/internal/worker/events", async (req, res) => {
    try {
        const payload = workerEventSchema.parse(req.body);
        await persistence.recordWorkerEvent(payload);
        res.status(202).json({ accepted: true });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, "Invalid worker event payload", error.issues);
            return;
        }
        const message = error instanceof Error ? error.message : "append_worker_event_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Append worker event failed", message);
    }
});
v1Router.get("/internal/worker/events", async (_req, res) => {
    try {
        const items = await persistence.listWorkerEvents();
        res.status(200).json({ items });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "list_worker_events_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "List worker events failed", message);
    }
});
export { v1Router };
