import apiClient from './apiClient';
import type { AuthResponse } from '../types/api';

export interface LoginRequest {
  email: string;
  password: string;
  forceLogoutOthers?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export const login = async (data: LoginRequest): Promise<AuthResponse> => {
  return apiClient.post<AuthResponse>(
    '/auth/login',
    {
      email: data.email,
      password: data.password,
      force_logout_others: data.forceLogoutOthers ?? false,
    },
    true
  );
};

export const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  return apiClient.post<AuthResponse>('/auth/register', {
    email: data.email,
    password: data.password,
    display_name: data.displayName,
  }, true);
};

export const loginGuest = async (displayName: string): Promise<AuthResponse> => {
  return apiClient.post<AuthResponse>('/auth/guest', { display_name: displayName }, true);
};

export const logout = async (accessToken: string): Promise<void> => {
  await apiClient.post('/auth/logout', { access_token: accessToken });
};
