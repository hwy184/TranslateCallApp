import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { hashPassword, verifyPassword } from "../services/password.js";
import { signHs256, verifyHs256 } from "../services/jwt.js";
import { createLivekitToken } from "../services/livekit-token.js";
import { persistence } from "../services/persistence.js";
import { startWorkerSession, stopWorkerSession, updateWorkerParticipantSettings } from "../services/worker-client.js";
import { ERROR_CODES, sendError } from "../types/api-error.js";
const v1Router = Router();
const ROOM_LOCK_WINDOW_MS = env.ROOM_LOCK_MINUTES * 60 * 1000;
const defaultSettingsSchema = z.object({
    source_language: z.enum(["vi", "en"]).default("vi"),
    target_language: z.enum(["vi", "en"]).default("en"),
    voice_profile: z.string().min(1).default("default")
});
const authGuestSchema = z.object({
    display_name: z.string().min(1).max(80).default("Guest User")
});
const authRegisterSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    display_name: z.string().min(1).max(80).optional()
});
const authLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
});
const authLogoutSchema = z.object({
    access_token: z.string().min(1).optional()
});
const roomCreateSchema = z.object({
    host_user_id: z.string().min(1),
    host_identity: z.string().min(1),
    host_display_name: z.string().min(1),
    provider_profile: z.string().min(1).default("google-first"),
    supported_languages: z.array(z.enum(["vi", "en"]))
        .min(2)
        .max(2)
        .default(["vi", "en"]),
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
const patchSettingsSchema = z.object({
    source_language: z.enum(["vi", "en"]).optional(),
    target_language: z.enum(["vi", "en"]).optional(),
    voice_profile: z.string().min(1).optional()
});
const historyQuerySchema = z.object({
    room_id: z.string().min(1).optional(),
    session_id: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(500).default(100)
});
const historySyncItemSchema = z.object({
    room_id: z.string().min(1),
    session_id: z.string().min(1),
    conversation_id: z.string().min(1),
    title: z.string().min(1).max(160),
    title_updated_at: z.string().datetime({ offset: true }).optional(),
    utterance_id: z.string().min(1),
    speaker_identity: z.string().min(1),
    source_lang: z.enum(["vi", "en"]),
    target_lang: z.enum(["vi", "en"]),
    source_text: z.string().nullable().optional(),
    translated_text: z.string().nullable().optional(),
    event_type: z.string().min(1),
    created_at: z.string().datetime({ offset: true }).optional()
});
const historySyncSchema = z.object({
    items: z.array(historySyncItemSchema).min(1)
});
const historyRenameSchema = z.object({
    title: z.string().min(1).max(160),
    title_updated_at: z.string().datetime({ offset: true }).optional()
});
const jwtPayloadSchema = z.object({
    sub: z.string().min(1),
    role: z.enum(["guest", "registered"]),
    exp: z.number().int().optional()
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
        if (!event.utterance_id)
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["utterance_id"], message: "utterance_id is required" });
        if (!event.speaker_identity)
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["speaker_identity"], message: "speaker_identity is required" });
        if (!event.source_lang)
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["source_lang"], message: "source_lang is required" });
        if (!event.target_lang)
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["target_lang"], message: "target_lang is required" });
    }
    if (event.type === "translation.final" && !event.translated_text) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["translated_text"], message: "translated_text is required for translation.final" });
    }
});
function issueJwt(userId, role) {
    const now = Math.floor(Date.now() / 1000);
    return signHs256({
        sub: userId,
        role,
        jti: randomUUID(),
        iat: now,
        exp: now + 60 * 60 * 24 * 7
    }, env.JWT_SECRET);
}
function getAccessTokenFromRequest(req) {
    const tokenFromHeader = typeof req.headers["x-access-token"] === "string" ? req.headers["x-access-token"] : undefined;
    const bearer = typeof req.headers.authorization === "string" ? req.headers.authorization.replace(/^Bearer\s+/i, "") : undefined;
    return tokenFromHeader ?? bearer;
}
async function requireAuth(req, res) {
    const token = getAccessTokenFromRequest(req);
    if (!token) {
        sendError(res, 401, ERROR_CODES.AUTH_UNAUTHORIZED, "Missing access token");
        return null;
    }
    const payload = verifyHs256(token, env.JWT_SECRET);
    if (!payload) {
        sendError(res, 401, ERROR_CODES.AUTH_UNAUTHORIZED, "Invalid access token");
        return null;
    }
    const parsed = jwtPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        sendError(res, 401, ERROR_CODES.AUTH_UNAUTHORIZED, "Invalid access token payload");
        return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (typeof parsed.data.exp === "number" && parsed.data.exp <= now) {
        sendError(res, 401, ERROR_CODES.AUTH_UNAUTHORIZED, "Access token expired");
        return null;
    }
    const activeSession = await persistence.getActiveAuthSession(token);
    if (!activeSession || activeSession.userId !== parsed.data.sub) {
        sendError(res, 401, ERROR_CODES.AUTH_UNAUTHORIZED, "Auth session is not active");
        return null;
    }
    return {
        token,
        userId: parsed.data.sub,
        role: parsed.data.role
    };
}
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
v1Router.get("/client/config", (_req, res) => {
    res.status(200).json({
        api_version: "v1",
        supported_languages: ["vi", "en"],
        room_lock_minutes: env.ROOM_LOCK_MINUTES,
        livekit_url: env.LIVEKIT_URL || null
    });
});
function isRoomExpired(room) {
    if (room.status === "closed")
        return false;
    const createdAtMs = Date.parse(room.createdAt);
    if (!Number.isFinite(createdAtMs))
        return false;
    return Date.now() - createdAtMs >= ROOM_LOCK_WINDOW_MS;
}
async function closeRoomIfExpired(room) {
    if (!isRoomExpired(room))
        return room;
    const closedRoom = await persistence.endRoom(room.roomId);
    await stopWorkerSession(closedRoom.sessionId, "room_timeout").catch(() => undefined);
    return closedRoom;
}
v1Router.post("/auth/guest", async (req, res) => {
    try {
        const payload = authGuestSchema.parse(req.body);
        const user = await persistence.createGuest(payload.display_name);
        const token = issueJwt(user.userId, "guest");
        const session = await persistence.createAuthSession(user.userId, token);
        res.status(201).json({ user, session });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "create_guest_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Create guest failed", message);
    }
});
v1Router.post("/auth/register", async (req, res) => {
    try {
        const payload = authRegisterSchema.parse(req.body);
        const normalizedEmail = payload.email.trim().toLowerCase();
        const existed = await persistence.loginRegisteredUser({ email: normalizedEmail });
        if (existed) {
            sendError(res, 409, ERROR_CODES.AUTH_EMAIL_EXISTS, "Email already exists");
            return;
        }
        const { hash, salt } = hashPassword(payload.password);
        const user = await persistence.registerRegisteredUser({
            email: normalizedEmail,
            passwordHash: hash,
            passwordSalt: salt,
            displayName: payload.display_name?.trim() || normalizedEmail
        });
        const sessionToken = issueJwt(user.userId, "registered");
        const session = await persistence.createAuthSession(user.userId, sessionToken);
        res.status(201).json({ user, session });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, "Invalid register payload", error.issues);
            return;
        }
        const message = error instanceof Error ? error.message : "register_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Register failed", message);
    }
});
v1Router.post("/auth/login", async (req, res) => {
    try {
        const payload = authLoginSchema.parse(req.body);
        const result = await persistence.loginRegisteredUser({ email: payload.email.trim().toLowerCase() });
        if (!result || !result.passwordHash || !result.passwordSalt) {
            sendError(res, 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS, "Invalid credentials");
            return;
        }
        const ok = verifyPassword(payload.password, result.passwordSalt, result.passwordHash);
        if (!ok) {
            sendError(res, 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS, "Invalid credentials");
            return;
        }
        const accessToken = issueJwt(result.user.userId, "registered");
        const session = await persistence.createAuthSession(result.user.userId, accessToken);
        res.status(200).json({ user: result.user, session });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, "Invalid login payload", error.issues);
            return;
        }
        const message = error instanceof Error ? error.message : "login_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Login failed", message);
    }
});
v1Router.post("/auth/logout", async (req, res) => {
    try {
        const payload = authLogoutSchema.parse(req.body);
        const accessToken = payload.access_token ?? getAccessTokenFromRequest(req);
        if (!accessToken) {
            sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, "Missing access token");
            return;
        }
        const removed = await persistence.deleteAuthSession(accessToken);
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
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        const payload = roomCreateSchema.parse(req.body);
        if (payload.host_user_id !== auth.userId) {
            sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, "Host user does not match access token");
            return;
        }
        const created = await persistence.createRoom({
            hostUserId: payload.host_user_id,
            hostUserType: auth.role,
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
            room_short_code: created.room.roomCode,
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
    try {
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        const payload = roomJoinSchema.parse(req.body);
        if (payload.guest_user_id !== auth.userId) {
            sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, "Guest user does not match access token");
            return;
        }
        const roomBeforeLock = await persistence.getRoom(payload.room_id);
        if (!roomBeforeLock) {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        const room = await closeRoomIfExpired(roomBeforeLock);
        if (room.status === "closed") {
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
        const warnings = [];
        let workerSessionState = "started";
        try {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "worker_start_failed";
            warnings.push(message);
            workerSessionState = "start_failed_best_effort";
            console.warn(`[room:join] worker start failed for ${room.sessionId}: ${message}`);
        }
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
            if (workerSessionState === "started") {
                await stopWorkerSession(room.sessionId, "join_commit_failed").catch(() => undefined);
            }
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
            room_short_code: joined.room.roomCode,
            participant: joined.guestParticipant,
            metadata: {
                room: roomMeta,
                participant: participantMeta
            },
            worker_session: {
                session_id: joined.room.sessionId,
                state: workerSessionState,
                participants: participantsPayload.length
            },
            warnings,
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
v1Router.get("/rooms/resolve/:code", async (req, res) => {
    try {
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        const code = z.string().regex(/^\d{6}$/).parse(req.params.code.trim());
        const roomBeforeLock = await persistence.getRoomByShortCode(code);
        if (!roomBeforeLock) {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        const room = await closeRoomIfExpired(roomBeforeLock);
        if (room.status === "closed") {
            sendError(res, 409, ERROR_CODES.ROOM_ENDED, "Room has already ended");
            return;
        }
        res.status(200).json({ room, room_short_code: room.roomCode });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "resolve_room_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Resolve room failed", message);
    }
});
v1Router.get("/rooms/:roomId/status", async (req, res) => {
    try {
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        const roomId = z.string().min(1).parse(req.params.roomId);
        const roomBeforeLock = await persistence.getRoom(roomId);
        if (!roomBeforeLock) {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        const room = await closeRoomIfExpired(roomBeforeLock);
        const canAccess = await persistence.userHasSessionAccess(auth.userId, room.sessionId);
        if (!canAccess) {
            sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, "You do not have access to this room status");
            return;
        }
        res.status(200).json({ room, room_short_code: room.roomCode });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "room_status_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Room status failed", message);
    }
});
v1Router.post("/rooms/:roomId/end", async (req, res) => {
    try {
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        const roomId = z.string().min(1).parse(req.params.roomId);
        const roomBeforeEnd = await persistence.getRoom(roomId);
        if (!roomBeforeEnd) {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        const hostParticipant = await persistence.getParticipantById(roomBeforeEnd.hostParticipantId);
        if (!hostParticipant || hostParticipant.userId !== auth.userId) {
            sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, "Only room host can end this room");
            return;
        }
        const room = await persistence.endRoom(roomId);
        const warnings = [];
        await stopWorkerSession(room.sessionId, "room_ended").catch((error) => {
            const message = error instanceof Error ? error.message : "worker_stop_failed";
            warnings.push(message);
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
v1Router.post("/rooms/:roomId/participants/:participantId/leave", async (req, res) => {
    try {
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        const roomId = z.string().min(1).parse(req.params.roomId);
        const participantId = z.string().min(1).parse(req.params.participantId);
        const ownedParticipant = await persistence.getParticipantById(participantId);
        if (!ownedParticipant || ownedParticipant.userId !== auth.userId) {
            sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, "You can only leave your own participant");
            return;
        }
        const { room, participant } = await persistence.leaveParticipant(roomId, participantId);
        res.status(200).json({
            room,
            room_short_code: room.roomCode,
            participant,
            worker_session: {
                session_id: room.sessionId,
                state: "room_remains_active"
            },
            warnings: []
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "participant_leave_failed";
        if (message === "room_not_found") {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        if (message === "participant_not_found") {
            sendError(res, 404, ERROR_CODES.PARTICIPANT_NOT_FOUND, "Participant was not found");
            return;
        }
        if (message === "room_ended") {
            sendError(res, 409, ERROR_CODES.ROOM_ENDED, "Room has already ended");
            return;
        }
        if (message === "host_must_end_room") {
            sendError(res, 409, ERROR_CODES.VALIDATION_ERROR, "Host must end the room instead of leaving");
            return;
        }
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Leave room failed", message);
    }
});
v1Router.patch("/rooms/:roomId/participants/:participantId/settings", async (req, res) => {
    try {
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        const roomId = z.string().min(1).parse(req.params.roomId);
        const participantId = z.string().min(1).parse(req.params.participantId);
        const payload = patchSettingsSchema.parse(req.body);
        const participantBeforeUpdate = await persistence.getParticipantById(participantId);
        if (!participantBeforeUpdate || participantBeforeUpdate.userId !== auth.userId) {
            sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, "You can only update your own participant settings");
            return;
        }
        const roomBeforeLock = await persistence.getRoom(roomId);
        if (!roomBeforeLock) {
            sendError(res, 404, ERROR_CODES.ROOM_NOT_FOUND, "Room was not found");
            return;
        }
        const room = await closeRoomIfExpired(roomBeforeLock);
        if (room.status === "closed") {
            sendError(res, 409, ERROR_CODES.ROOM_ENDED, "Room has already ended");
            return;
        }
        const participant = await persistence.updateParticipantSettings(roomId, participantId, payload);
        await updateWorkerParticipantSettings({
            sessionId: room.sessionId,
            participantIdentity: participant.identity,
            sourceLanguage: payload.source_language,
            targetLanguage: payload.target_language,
            voiceProfile: payload.voice_profile
        }).catch(() => undefined);
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
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        if (auth.role !== "registered") {
            sendError(res, 403, ERROR_CODES.USER_NOT_REGISTERED, "Cloud history is for registered users only");
            return;
        }
        const query = historyQuerySchema.parse(req.query);
        if (query.session_id) {
            const canAccess = await persistence.userHasSessionAccess(auth.userId, query.session_id);
            if (!canAccess) {
                sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, "You do not have access to this history session");
                return;
            }
        }
        const items = await persistence.listHistory({
            roomId: query.room_id,
            sessionId: query.session_id,
            userId: auth.userId,
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
v1Router.post("/history/sync", async (req, res) => {
    try {
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        if (auth.role !== "registered") {
            sendError(res, 403, ERROR_CODES.USER_NOT_REGISTERED, "Guest users cannot sync cloud history");
            return;
        }
        const payload = historySyncSchema.parse(req.body);
        const sessionIds = new Set(payload.items.map((item) => item.session_id));
        for (const sessionId of sessionIds) {
            const canAccess = await persistence.userHasSessionAccess(auth.userId, sessionId);
            if (!canAccess) {
                sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, `No access to session ${sessionId}`);
                return;
            }
        }
        const inserted = await persistence.syncHistoryItems(payload.items);
        res.status(200).json({ synced: inserted, received: payload.items.length });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, "Invalid history sync payload", error.issues);
            return;
        }
        const message = error instanceof Error ? error.message : "sync_history_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Sync history failed", message);
    }
});
v1Router.patch("/history/conversations/:conversationId/title", async (req, res) => {
    try {
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        if (auth.role !== "registered") {
            sendError(res, 403, ERROR_CODES.USER_NOT_REGISTERED, "Cloud history is for registered users only");
            return;
        }
        const conversationId = z.string().min(1).parse(req.params.conversationId);
        const payload = historyRenameSchema.parse(req.body);
        const sessionId = await persistence.getConversationSessionId(conversationId);
        if (!sessionId) {
            sendError(res, 404, ERROR_CODES.HISTORY_NOT_FOUND, "Conversation was not found");
            return;
        }
        const canAccess = await persistence.userHasSessionAccess(auth.userId, sessionId);
        if (!canAccess) {
            sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, "You do not have access to this conversation");
            return;
        }
        const updated = await persistence.renameConversationTitle({
            conversationId,
            title: payload.title.trim(),
            titleUpdatedAt: payload.title_updated_at
        });
        if (!updated) {
            sendError(res, 404, ERROR_CODES.HISTORY_NOT_FOUND, "Conversation was not found");
            return;
        }
        res.status(200).json({ conversation: updated });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, "Invalid conversation rename payload", error.issues);
            return;
        }
        const message = error instanceof Error ? error.message : "rename_conversation_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Rename conversation failed", message);
    }
});
v1Router.delete("/history/:id", async (req, res) => {
    try {
        const auth = await requireAuth(req, res);
        if (!auth)
            return;
        if (auth.role !== "registered") {
            sendError(res, 403, ERROR_CODES.USER_NOT_REGISTERED, "Cloud history is for registered users only");
            return;
        }
        const id = z.coerce.number().int().positive().parse(req.params.id);
        const historyItem = await persistence.getHistoryItemById(id);
        if (!historyItem) {
            sendError(res, 404, ERROR_CODES.HISTORY_NOT_FOUND, "History item was not found");
            return;
        }
        const canAccess = await persistence.userHasSessionAccess(auth.userId, historyItem.session_id);
        if (!canAccess) {
            sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, "You do not have access to this history item");
            return;
        }
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
v1Router.delete("/history", async (_req, res) => {
    try {
        sendError(res, 403, ERROR_CODES.AUTH_FORBIDDEN, "Delete all history is disabled");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "delete_all_history_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "Delete history failed", message);
    }
});
v1Router.post("/translate/text", (_req, res) => {
    sendError(res, 501, ERROR_CODES.NOT_IMPLEMENTED, "POST /translate/text is out of MVP scope");
});
v1Router.post("/internal/worker/events", async (req, res) => {
    try {
        const workerSecret = typeof req.headers["x-worker-secret"] === "string" ? req.headers["x-worker-secret"] : "";
        if (!workerSecret || workerSecret !== env.WORKER_INTERNAL_SECRET) {
            sendError(res, 401, ERROR_CODES.AUTH_UNAUTHORIZED, "Invalid worker secret");
            return;
        }
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
        const workerSecret = typeof _req.headers["x-worker-secret"] === "string" ? _req.headers["x-worker-secret"] : "";
        if (!workerSecret || workerSecret !== env.WORKER_INTERNAL_SECRET) {
            sendError(res, 401, ERROR_CODES.AUTH_UNAUTHORIZED, "Invalid worker secret");
            return;
        }
        const items = await persistence.listWorkerEvents();
        res.status(200).json({ items });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "list_worker_events_failed";
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "List worker events failed", message);
    }
});
export { v1Router };
