// App-wide constants for LINGUA

export const APP_NAME = 'LINGUA';
export const APP_TAGLINE = 'KẾT NỐI MỌI NGÔN NGỮ';

// API
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  `http://${process.env.EXPO_PUBLIC_SERVER_HOST?.trim() || '192.168.1.7'}:3000/api/v1`;
export const LIVEKIT_URL =
  process.env.EXPO_PUBLIC_LIVEKIT_URL?.trim() || 'wss://translatestream-wuc53qsp.livekit.cloud';
export const API_TIMEOUT = 10000;

// Room code input max length for quick join form.
export const ROOM_CODE_LENGTH = 6;

// Languages supported
export const LANGUAGES = [
  { code: 'vi', label: 'Tiếng Việt', flag: 'VN' },
  { code: 'en', label: 'Tiếng Anh', flag: 'EN' },
];

// AsyncStorage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: '@lingua/auth_token',
  USER_INFO: '@lingua/user_info',
  AUTH_SESSION: '@lingua/auth_session',
  ROOM_CONTEXT: '@lingua/room_context',
  API_BASE_URL: '@lingua/api_base_url',
  LIVEKIT_URL: '@lingua/livekit_url',
  CALL_HISTORY: '@lingua/call_history',
  SETTINGS: '@lingua/settings',
  GUEST_HISTORY: '@lingua/guest_history',
};
