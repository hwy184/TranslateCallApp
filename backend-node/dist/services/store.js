import { randomUUID } from "node:crypto";
function nowIso() {
    return new Date().toISOString();
}
class InMemoryStore {
    maxWorkerEvents = 500;
    users = new Map();
    authSessions = new Map();
    rooms = new Map();
    participants = new Map();
    workerEvents = [];
    createGuest(displayName) {
        const userId = `guest_${randomUUID()}`;
        const user = { userId, type: "guest", displayName };
        this.users.set(userId, user);
        return { user, session: this.createAuthSession(userId) };
    }
    createRegisteredSession(displayName) {
        const userId = `user_${displayName.toLowerCase().replace(/\s+/g, "_")}`;
        const existing = this.users.get(userId);
        const user = existing ?? { userId, type: "registered", displayName };
        this.users.set(userId, user);
        return { user, session: this.createAuthSession(userId) };
    }
    deleteAuthSession(accessToken) {
        return this.authSessions.delete(accessToken);
    }
    createRoom(input) {
        const roomId = `room_${randomUUID()}`;
        const sessionId = `session_${randomUUID()}`;
        const hostParticipantId = `participant_${randomUUID()}`;
        const hostParticipant = {
            participantId: hostParticipantId,
            identity: input.hostIdentity,
            role: "host",
            userId: input.hostUserId,
            joinedAt: nowIso(),
            settings: input.hostSettings
        };
        const room = {
            roomId,
            sessionId,
            hostParticipantId,
            status: "waiting_guest",
            createdAt: nowIso(),
            providerProfile: input.providerProfile,
            supportedLanguages: input.supportedLanguages
        };
        this.participants.set(hostParticipantId, hostParticipant);
        this.rooms.set(roomId, room);
        return { room, hostParticipant };
    }
    joinRoom(input) {
        const room = this.rooms.get(input.roomId);
        if (!room) {
            throw new Error("room_not_found");
        }
        if (room.status === "ended") {
            throw new Error("room_ended");
        }
        if (room.guestParticipantId) {
            throw new Error("room_already_has_guest");
        }
        const guestParticipantId = `participant_${randomUUID()}`;
        const guestParticipant = {
            participantId: guestParticipantId,
            identity: input.guestIdentity,
            role: "guest",
            userId: input.guestUserId,
            joinedAt: nowIso(),
            settings: input.guestSettings
        };
        const updatedRoom = {
            ...room,
            guestParticipantId,
            status: "active"
        };
        this.participants.set(guestParticipantId, guestParticipant);
        this.rooms.set(room.roomId, updatedRoom);
        return { room: updatedRoom, guestParticipant };
    }
    endRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error("room_not_found");
        }
        if (room.status === "ended") {
            return room;
        }
        const ended = { ...room, status: "ended", endedAt: nowIso() };
        this.rooms.set(roomId, ended);
        return ended;
    }
    updateParticipantSettings(roomId, participantId, settings) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error("room_not_found");
        }
        const participant = this.participants.get(participantId);
        if (!participant) {
            throw new Error("participant_not_found");
        }
        const updated = {
            ...participant,
            settings: {
                ...participant.settings,
                ...settings
            }
        };
        this.participants.set(participantId, updated);
        return updated;
    }
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    getParticipant(participantId) {
        return this.participants.get(participantId);
    }
    appendWorkerEvent(event) {
        if (this.workerEvents.length >= this.maxWorkerEvents) {
            this.workerEvents.shift();
        }
        this.workerEvents.push({ ...event, received_at: nowIso() });
    }
    listWorkerEvents(limit = 100) {
        return this.workerEvents.slice(-limit);
    }
    createAuthSession(userId) {
        const accessToken = `local_${randomUUID()}`;
        const session = { accessToken, userId, createdAt: nowIso() };
        this.authSessions.set(accessToken, session);
        return session;
    }
}
export const store = new InMemoryStore();
