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

  async request<T>(
    path: string,
    options: RequestInit = {},
    skipAuth = false
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT);

    const headers = new Headers(options.headers ?? {});
    headers.set('Content-Type', 'application/json');

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
      throw parseBackendError(response.status, payload);
    }

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
