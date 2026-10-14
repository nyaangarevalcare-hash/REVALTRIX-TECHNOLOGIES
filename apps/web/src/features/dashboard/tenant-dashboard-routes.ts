import type { TenantType } from './types.js';

const LEGACY_TENANT_DASHBOARD_ROUTES: Record<TenantType, string> = {
  HOSPITAL: '/tenant/hospital',
  CLINIC: '/tenant/clinic',
  SPECIALIST_PRACTICE: '/tenant/specialist-practice',
  MEDICAL_CENTER: '/tenant/medical-center',
  DIAGNOSTIC_CENTER: '/tenant/diagnostic-center',
  LABORATORY: '/tenant/laboratory',
  RADIOLOGY_CENTER: '/tenant/radiology-center',
  PHARMACY: '/tenant/pharmacy',
  DENTAL_CLINIC: '/tenant/dental-clinic',
  OPTICAL_CENTER: '/tenant/optical-center',
  MATERNITY_CENTER: '/tenant/maternity-center',
  REHABILITATION_CENTER: '/tenant/rehabilitation-center',
  HOME_HEALTH_PROVIDER: '/tenant/home-health',
  AMBULANCE_PROVIDER: '/tenant/ambulance',
  HEALTHCARE_NETWORK: '/tenant/healthcare-network',
  CORPORATE_HEALTH_PROVIDER: '/tenant/corporate-health',
  INSURER: '/tenant/insurer',
  EXTERNAL_PROVIDER: '/tenant/external-provider',
  OTHER_HEALTHCARE_PROVIDER: '/tenant/other-healthcare',
};

export function getTenantDashboardRoute(_tenantType: TenantType): string {
  return '/tenant/dashboard';
}

export function isLegacyTenantDashboardRoute(tenantType: TenantType, path: string): boolean {
  return path === LEGACY_TENANT_DASHBOARD_ROUTES[tenantType];
}

export function isTenantDashboardRoute(path: string): boolean {
  return path.startsWith('/tenant/');
}
