import { API_TIMEOUT } from '../constants';
import { useAuthStore } from '../store/authStore';

export interface SystemHealth {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  db?: 'ok' | 'unreachable';
  worker?: 'ok' | 'unreachable';
  worker_details?: unknown;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const baseUrl = useAuthStore.getState().apiBaseUrl;
  const healthBaseUrl = baseUrl.replace(/\/api\/v1\/?$/i, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(`${healthBaseUrl}/health`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        status: 'degraded',
        service: 'backend-node',
        version: 'unknown',
        ...(payload ?? {}),
      } as SystemHealth;
    }

    return payload as SystemHealth;
  } catch {
    return {
      status: 'degraded',
      service: 'backend-node',
      version: 'unknown',
      db: 'unreachable',
      worker: 'unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}
