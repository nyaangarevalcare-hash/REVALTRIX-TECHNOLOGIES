import { authenticatedApiRequest } from '../../../lib/auth-api.js';
import type { TenantSetupResponse } from '../types/tenant-setup.types.js';

export async function getTenantSetup(): Promise<TenantSetupResponse> {
  return authenticatedApiRequest<TenantSetupResponse>('/v1/tenant-setup');
}

export async function requestTenantActivation(): Promise<{
  accepted: boolean;
  status: TenantSetupResponse['setup']['status'];
  message: string;
}> {
  return authenticatedApiRequest<{
    accepted: boolean;
    status: TenantSetupResponse['setup']['status'];
    message: string;
  }>('/v1/tenant-setup/activation/request', { method: 'POST' });
}
