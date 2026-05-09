import { API_TIMEOUT } from '../constants';
import { useAuthStore } from '../store/authStore';
import { ApiClientError, parseBackendError } from './errors';

type JsonValue = Record<string, unknown> | null;

async function safeParseJson(response: Response): Promise<JsonValue> {
  try {
    return (await response.json()) as JsonValue;
  } catch {
    return null;
  }
}

class ApiClient {
  private guestRecoveryPromise: Promise<boolean> | null = null;
  private unauthorizedStreak = 0;

  private resolveBaseUrl(): string {
    return useAuthStore.getState().apiBaseUrl;
  }

  private shouldBypassNgrokWarning(baseUrl: string): boolean {
    try {
      const host = new URL(baseUrl).hostname.toLowerCase();
      return host.endsWith(".ngrok-free.app") || host.endsWith(".ngrok-free.dev");
    } catch {
      return false;
    }
  }

  private resolveToken(): string | null {
    return useAuthStore.getState().session?.accessToken ?? null;
  }

  private async recoverFromUnauthorized(skipAuth: boolean): Promise<boolean> {
    if (skipAuth) return false;

    const state = useAuthStore.getState();
    if (!state.user) return false;

    if (state.user.type === 'registered') {
      await state.logout();
      return false;
    }

    if (this.guestRecoveryPromise) {
      return this.guestRecoveryPromise;
    }

    this.guestRecoveryPromise = (async () => {
      const baseUrl = this.resolveBaseUrl();
      try {
        const response = await fetch(`${baseUrl}/auth/guest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: `Guest_${Date.now().toString().slice(-4)}` }),
        });
        const payload = await safeParseJson(response);
        const user = (payload as any)?.user;
        const session = (payload as any)?.session;
        if (!response.ok || !user || !session) {
          await state.logout();
          return false;
        }
        await useAuthStore.getState().setGuestAuth(user, session);
        return true;
      } catch {
        await state.logout();
        return false;
      } finally {
        this.guestRecoveryPromise = null;
      }
    })();

    return this.guestRecoveryPromise;
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
    skipAuth = false,
    hasRetried = false
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT);

    const headers = new Headers(options.headers ?? {});
    headers.set('Content-Type', 'application/json');
    headers.set('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');

    const baseUrl = this.resolveBaseUrl();
    if (this.shouldBypassNgrokWarning(baseUrl)) {
      headers.set("ngrok-skip-browser-warning", "true");
    }

    const token = this.resolveToken();
    if (!skipAuth && token) {
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('x-access-token', token);
    }

    let response: Response;
    let payload: JsonValue;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });
      payload = await safeParseJson(response);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiClientError({
          status: 0,
          code: 'NETWORK_TIMEOUT',
          message: 'Request timed out',
        });
      }

      throw new ApiClientError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Cannot connect to backend',
        details: error,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const parsedError = parseBackendError(response.status, payload);
      if (response.status === 401 && !hasRetried) {
        const recovered = await this.recoverFromUnauthorized(skipAuth);
        if (recovered) {
          this.unauthorizedStreak = 0;
          return this.request<T>(path, options, skipAuth, true);
        }
      }
      if (response.status === 401) {
        this.unauthorizedStreak += 1;
        if (this.unauthorizedStreak >= 3) {
          // Force leave room context after repeated auth rejection to avoid stuck call state.
          await useAuthStore.getState().setRoomContext(null).catch(() => undefined);
          this.unauthorizedStreak = 0;
        }
      } else {
        this.unauthorizedStreak = 0;
      }
      throw parsedError;
    }

    this.unauthorizedStreak = 0;
    return payload as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown, skipAuth = false): Promise<T> {
    return this.request<T>(
      path,
      {
        method: 'POST',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      skipAuth
    );
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

const apiClient = new ApiClient();
export default apiClient;
