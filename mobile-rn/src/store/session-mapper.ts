import type { CreateRoomResponse, JoinRoomResponse } from "../types/api";

export type RoomRole = "host" | "guest";

export interface RoomContext {
  role: RoomRole;
  roomId: string;
  sessionId: string;
  participantId: string;
  participantIdentity: string;
  participantDisplayName: string;
  livekitRoomName: string;
  livekitToken: string | null;
  livekitTokenStatus: string;
}

export function mapCreateToRoomContext(input: {
  role: RoomRole;
  displayName: string;
  payload: CreateRoomResponse;
}): RoomContext {
  return {
    role: input.role,
    roomId: input.payload.room.roomId,
    sessionId: input.payload.room.sessionId,
    participantId: input.payload.participant.participantId,
    participantIdentity: input.payload.participant.identity,
    participantDisplayName: input.displayName,
    livekitRoomName: input.payload.livekit.room_name,
    livekitToken: input.payload.livekit.token,
    livekitTokenStatus: input.payload.livekit.token_status
  };
}

export function mapJoinToRoomContext(input: {
  role: RoomRole;
  displayName: string;
  payload: JoinRoomResponse;
}): RoomContext {
  return {
    role: input.role,
    roomId: input.payload.room.roomId,
    sessionId: input.payload.room.sessionId,
    participantId: input.payload.participant.participantId,
    participantIdentity: input.payload.participant.identity,
    participantDisplayName: input.displayName,
    livekitRoomName: input.payload.livekit.room_name,
    livekitToken: input.payload.livekit.token,
    livekitTokenStatus: input.payload.livekit.token_status
  };
}
