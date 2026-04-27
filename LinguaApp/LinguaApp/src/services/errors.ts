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
    return 'Loi ket noi mang. Kiem tra API URL va internet.';
  }

  switch (error.code) {
    case 'NETWORK_TIMEOUT':
      return 'Request timeout. Mang yeu hoac backend cham phan hoi.';
    case 'NETWORK_ERROR':
      return 'Khong ket noi duoc backend.';
    case 'VALIDATION_ERROR':
      return 'Du lieu gui len khong hop le.';
    case 'ROOM_NOT_FOUND':
      return 'Khong tim thay room.';
    case 'ROOM_ENDED':
      return 'Room da ket thuc.';
    case 'ROOM_ALREADY_HAS_GUEST':
      return 'Room da co guest.';
    case 'WORKER_START_FAILED':
      return 'AI worker start that bai. Thu lai sau.';
    case 'USER_NOT_REGISTERED':
      return 'Guest chi luu local, khong sync cloud.';
    case 'SESSION_NOT_FOUND':
      return 'Session khong ton tai.';
    default:
      return `${error.message} (${error.code})`;
  }
}
