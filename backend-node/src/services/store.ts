import { randomUUID } from "node:crypto";
import type { AuthSession, Participant, ParticipantSettings, Room, User } from "../types/domain.js";

function nowIso() {
  return new Date().toISOString();
}

class InMemoryStore {
  private readonly maxWorkerEvents = 500;
  private users = new Map<string, User>();
  private authSessions = new Map<string, AuthSession>();
  private rooms = new Map<string, Room>();
  private participants = new Map<string, Participant>();
  private workerEvents: Array<Record<string, unknown>> = [];

  createGuest(displayName: string): { user: User; session: AuthSession } {
    const userId = `guest_${randomUUID()}`;
    const user: User = { userId, type: "guest", displayName };
    this.users.set(userId, user);
    return { user, session: this.createAuthSession(userId) };
  }

  createRegisteredSession(displayName: string): { user: User; session: AuthSession } {
    const userId = `user_${displayName.toLowerCase().replace(/\s+/g, "_")}`;
    const existing = this.users.get(userId);
    const user: User = existing ?? { userId, type: "registered", displayName };
    this.users.set(userId, user);
    return { user, session: this.createAuthSession(userId) };
  }

  deleteAuthSession(accessToken: string): boolean {
    return this.authSessions.delete(accessToken);
  }

  createRoom(input: {
    hostUserId: string;
    hostIdentity: string;
    hostSettings: ParticipantSettings;
    providerProfile: string;
    supportedLanguages: string[];
  }): { room: Room; hostParticipant: Participant } {
    const roomId = `room_${randomUUID()}`;
    const roomCode = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    const sessionId = `session_${randomUUID()}`;
    const hostParticipantId = `participant_${randomUUID()}`;
    const hostParticipant: Participant = {
      participantId: hostParticipantId,
      identity: input.hostIdentity,
      role: "host",
      userId: input.hostUserId,
      joinedAt: nowIso(),
      settings: input.hostSettings
    };
    const room: Room = {
      roomId,
      roomCode,
      sessionId,
      hostParticipantId,
      status: "waiting",
      createdAt: nowIso(),
      providerProfile: input.providerProfile,
      supportedLanguages: input.supportedLanguages
    };

    this.participants.set(hostParticipantId, hostParticipant);
    this.rooms.set(roomId, room);
    return { room, hostParticipant };
  }

  joinRoom(input: {
    roomId: string;
    guestUserId: string;
    guestIdentity: string;
    guestSettings: ParticipantSettings;
  }): { room: Room; guestParticipant: Participant } {
    const room = this.rooms.get(input.roomId);
    if (!room) {
      throw new Error("room_not_found");
    }
    if (room.status === "closed") {
      throw new Error("room_ended");
    }
    if (room.guestParticipantId) {
      throw new Error("room_already_has_guest");
    }

    const guestParticipantId = `participant_${randomUUID()}`;
    const guestParticipant: Participant = {
      participantId: guestParticipantId,
      identity: input.guestIdentity,
      role: "guest",
      userId: input.guestUserId,
      joinedAt: nowIso(),
      settings: input.guestSettings
    };

    const updatedRoom: Room = {
      ...room,
      guestParticipantId,
      status: "active"
    };

    this.participants.set(guestParticipantId, guestParticipant);
    this.rooms.set(room.roomId, updatedRoom);

    return { room: updatedRoom, guestParticipant };
  }

  endRoom(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("room_not_found");
    }
    if (room.status === "closed") {
      return room;
    }

    const ended: Room = { ...room, status: "closed", endedAt: nowIso() };
    this.rooms.set(roomId, ended);
    return ended;
  }

  updateParticipantSettings(roomId: string, participantId: string, settings: Partial<ParticipantSettings>): Participant {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("room_not_found");
    }

    const participant = this.participants.get(participantId);
    if (!participant) {
      throw new Error("participant_not_found");
    }

    const updated: Participant = {
      ...participant,
      settings: {
        ...participant.settings,
        ...settings
      }
    };
    this.participants.set(participantId, updated);
    return updated;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getParticipant(participantId: string): Participant | undefined {
    return this.participants.get(participantId);
  }

  appendWorkerEvent(event: Record<string, unknown>) {
    if (this.workerEvents.length >= this.maxWorkerEvents) {
      this.workerEvents.shift();
    }
    this.workerEvents.push({ ...event, received_at: nowIso() });
  }

  listWorkerEvents(limit = 100): Array<Record<string, unknown>> {
    return this.workerEvents.slice(-limit);
  }

  private createAuthSession(userId: string): AuthSession {
    const accessToken = `local_${randomUUID()}`;
    const session: AuthSession = { accessToken, userId, createdAt: nowIso() };
    this.authSessions.set(accessToken, session);
    return session;
  }
}

export const store = new InMemoryStore();
