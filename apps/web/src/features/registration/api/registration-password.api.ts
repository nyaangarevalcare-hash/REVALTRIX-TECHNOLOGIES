import { apiRequest } from '../../../lib/api.js';
import { getRegistrationToken } from './registration-dashboard.api.js';

export interface RegistrationPasswordStatus {
  configured: boolean;
}

export interface SetRegistrationPasswordResponse {
  passwordConfigured: boolean;
  registrationId: string;
  registrationType: 'TENANT' | 'PATIENT';
  registrationStatus: string;
  verificationStatus: string;
  onboardingStatus: string;
  authentication?: {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    expiresAt: string;
    userId: string;
  };
}

function registrationHeaders(): HeadersInit {
  const token = getRegistrationToken();

  if (!token) {
    throw new Error('Registration session is required.');
  }

  return {
    'X-Registration-Token': token,
  };
}

export async function getRegistrationPasswordStatus(): Promise<RegistrationPasswordStatus> {
  return apiRequest<RegistrationPasswordStatus>('/v1/registration/password/status', {
    headers: registrationHeaders(),
  });
}

export async function setRegistrationPassword(
  password: string,
  confirmPassword: string,
): Promise<SetRegistrationPasswordResponse> {
  return apiRequest<SetRegistrationPasswordResponse>('/v1/registration/password', {
    method: 'PATCH',
    headers: registrationHeaders(),
    body: JSON.stringify({
      password,
      confirmPassword,
    }),
  });
}
