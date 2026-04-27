import apiClient from './apiClient';
import type {
  CreateRoomResponse,
  EndRoomResponse,
  JoinRoomResponse,
  LeaveParticipantResponse,
  RoomStatusResponse
} from '../types/api';

export interface CreateRoomRequest {
  hostUserId: string;
  hostIdentity: string;
  hostDisplayName: string;
  sourceLanguage: string;
  targetLanguage: string;
  voiceProfile: string;
}

export interface JoinRoomRequest {
  roomId: string;
  guestUserId: string;
  guestIdentity: string;
  guestDisplayName: string;
  sourceLanguage: string;
  targetLanguage: string;
  voiceProfile: string;
}

export function toShortCode(roomId: string): string {
  const fallback = roomId.replace(/^room_/, '').slice(-6);
  return fallback.padStart(6, '0').slice(0, 6);
}

export const createRoom = async (data: CreateRoomRequest): Promise<CreateRoomResponse> => {
  return apiClient.post<CreateRoomResponse>('/rooms', {
    host_user_id: data.hostUserId,
    host_identity: data.hostIdentity,
    host_display_name: data.hostDisplayName,
    provider_profile: 'google-first',
    supported_languages: ['vi', 'en'],
    host_settings: {
      source_language: data.sourceLanguage,
      target_language: data.targetLanguage,
      voice_profile: data.voiceProfile,
    },
  });
};

export const joinRoom = async (data: JoinRoomRequest): Promise<JoinRoomResponse> => {
  return apiClient.post<JoinRoomResponse>('/rooms/join', {
    room_id: data.roomId,
    guest_user_id: data.guestUserId,
    guest_identity: data.guestIdentity,
    guest_display_name: data.guestDisplayName,
    guest_settings: {
      source_language: data.sourceLanguage,
      target_language: data.targetLanguage,
      voice_profile: data.voiceProfile,
    },
  });
};

export const endRoom = async (roomId: string): Promise<EndRoomResponse> => {
  return apiClient.post<EndRoomResponse>(`/rooms/${roomId}/end`);
};

export const leaveParticipant = async (
  roomId: string,
  participantId: string
): Promise<LeaveParticipantResponse> => {
  return apiClient.post<LeaveParticipantResponse>(
    `/rooms/${roomId}/participants/${participantId}/leave`
  );
};

export const getRoomStatus = async (roomId: string): Promise<RoomStatusResponse> => {
  return apiClient.get<RoomStatusResponse>(`/rooms/${roomId}/status`);
};

export const resolveRoomByShortCode = async (shortCode: string): Promise<RoomStatusResponse> => {
  return apiClient.get<RoomStatusResponse>(
    `/rooms/resolve/${encodeURIComponent(shortCode.trim())}`
  );
};

export const updateParticipantSettings = async (
  roomId: string,
  participantId: string,
  input: { sourceLanguage?: string; targetLanguage?: string; voiceProfile?: string }
): Promise<void> => {
  await apiClient.patch(`/rooms/${roomId}/participants/${participantId}/settings`, {
    source_language: input.sourceLanguage,
    target_language: input.targetLanguage,
    voice_profile: input.voiceProfile,
  });
};

export const toRoomContextFromCreate = (
  payload: CreateRoomResponse,
  displayName: string,
  roomTitle?: string,
  roomStatusLabel?: string
) => ({
  role: 'host' as const,
  roomId: payload.room.roomId,
  sessionId: payload.room.sessionId,
  participantId: payload.participant.participantId,
  participantIdentity: payload.participant.identity,
  participantDisplayName: displayName,
  roomTitle: roomTitle?.trim() || `Phòng ${payload.room.roomCode}`,
  roomStatusLabel: roomStatusLabel?.trim() || 'Sẵn sàng',
  roomShortCode: payload.room_short_code ?? toShortCode(payload.room.roomId),
  livekitRoomName: payload.livekit.room_name,
  livekitToken: payload.livekit.token,
  livekitTokenStatus: payload.livekit.token_status,
});

export const toRoomContextFromJoin = (
  payload: JoinRoomResponse,
  displayName: string
) => ({
  role: 'guest' as const,
  roomId: payload.room.roomId,
  sessionId: payload.room.sessionId,
  participantId: payload.participant.participantId,
  participantIdentity: payload.participant.identity,
  participantDisplayName: displayName,
  roomTitle: `Phòng ${payload.room.roomCode}`,
  roomStatusLabel:
    payload.room.status === 'active'
      ? 'Đang hoạt động'
      : payload.room.status === 'closed'
        ? 'Đã kết thúc'
        : 'Đang chờ',
  roomShortCode: payload.room_short_code ?? toShortCode(payload.room.roomId),
  workerSessionState: payload.worker_session?.state,
  livekitRoomName: payload.livekit.room_name,
  livekitToken: payload.livekit.token,
  livekitTokenStatus: payload.livekit.token_status,
});
