import { apiRequest } from './api.js';
import {
  clearAuthSession,
  getAuthSession,
  setAuthSession,
} from '../features/auth/api/auth-session.js';

export async function authenticatedApiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const session = getAuthSession();

  if (!session) {
    throw new Error('Authentication required.');
  }

  const departmentId =
    window.location.pathname === '/staff/department'
      ? new URLSearchParams(window.location.search).get('department')
      : null;
  const departmentAccessToken = departmentId
    ? window.sessionStorage.getItem(`revaltrix_department_access:${departmentId}`)
    : null;

  try {
    return await apiRequest<T>(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(departmentAccessToken ? { 'X-Department-Access-Token': departmentAccessToken } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Request failed with status 401') {
      clearAuthSession();
    }

    throw error;
  }
}

export async function storeAuthenticationResponse(authentication: {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: string;
  userId: string;
}): Promise<void> {
  setAuthSession(authentication);
}

export { clearAuthSession };
