import type { BackendErrorPayload } from '../types/api';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor(input: { status: number; code: string; message: string; details?: unknown }) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
    this.details = input.details ?? null;
  }
}

export function parseBackendError(status: number, payload: unknown): ApiClientError {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as any).error?.code === 'string' &&
    typeof (payload as any).error?.message === 'string'
  ) {
    const body = payload as BackendErrorPayload;
    return new ApiClientError({
      status,
      code: body.error.code,
      message: body.error.message,
      details: body.error.details,
    });
  }

  return new ApiClientError({
    status,
    code: 'UNKNOWN_BACKEND_ERROR',
    message: 'Unexpected backend error',
    details: payload,
  });
}

export function friendlyErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) {
    if (error instanceof Error && error.message === 'history_empty') {
      return 'Chưa có dữ liệu lịch sử cho phiên này.';
    }
    return 'Lỗi kết nối mạng. Vui lòng kiểm tra internet rồi thử lại.';
  }

  switch (error.code) {
    case 'NETWORK_TIMEOUT':
      return 'Yêu cầu quá thời gian. Mạng yếu hoặc backend phản hồi chậm.';
    case 'NETWORK_ERROR':
      return 'Không kết nối được backend.';
    case 'VALIDATION_ERROR':
      return 'Dữ liệu gửi lên không hợp lệ.';
    case 'ROOM_NOT_FOUND':
      return 'Không tìm thấy phòng.';
    case 'ROOM_ENDED':
      return 'Phòng đã kết thúc.';
    case 'ROOM_ALREADY_HAS_GUEST':
      return 'Phòng đã có khách.';
    case 'WORKER_START_FAILED':
      return 'Khởi động AI worker thất bại. Thử lại sau.';
    case 'USER_NOT_REGISTERED':
      return 'Tài khoản khách chỉ lưu cục bộ, không đồng bộ cloud.';
    case 'HISTORY_CLOUD_LIMIT_REACHED':
      return 'Cloud đã đạt giới hạn 20 cuộc hội thoại. Hãy xóa bớt trên mục Đám mây rồi sync lại.';
    case 'SESSION_NOT_FOUND':
      return 'Phiên không tồn tại.';
    default:
      return `${error.message} (${error.code})`;
  }
}
