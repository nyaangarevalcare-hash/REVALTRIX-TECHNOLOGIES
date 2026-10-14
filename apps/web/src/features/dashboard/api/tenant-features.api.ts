import { authenticatedApiRequest } from '../../../lib/auth-api.js';

export type TenantFeature =
  | 'APPOINTMENTS'
  | 'QUEUE'
  | 'ENCOUNTERS'
  | 'REFERRALS'
  | 'LABORATORY'
  | 'RADIOLOGY'
  | 'PHARMACY'
  | 'PROCEDURES'
  | 'THEATRE'
  | 'TELEHEALTH'
  | 'HOME_VISITS'
  | 'AMBULANCE'
  | 'SHOP'
  | 'INVENTORY'
  | 'POS'
  | 'INSURANCE'
  | 'CORPORATE'
  | 'CLAIMS'
  | 'DISPATCH'
  | 'ROUTE_PLANNING'
  | 'MATERNITY'
  | 'REHABILITATION'
  | 'OPTICAL'
  | 'DENTAL'
  | 'NETWORK'
  | 'EXTERNAL_INTEGRATIONS';

export interface TenantFeatureState {
  feature: TenantFeature;
  supported: boolean;
  enabled: boolean;
  overridden: boolean;
}

export function getTenantFeatures(): Promise<TenantFeatureState[]> {
  return authenticatedApiRequest<TenantFeatureState[]>('/v1/tenant-features');
}

export function getTenantFeatureManagementAccess(): Promise<boolean> {
  return authenticatedApiRequest<boolean>('/v1/tenant-features/management-access');
}

export function updateTenantFeature(
  tenantId: string,
  feature: TenantFeature,
  enabled: boolean,
): Promise<unknown> {
  return authenticatedApiRequest(`/v1/tenant-features/${tenantId}/${feature}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}
