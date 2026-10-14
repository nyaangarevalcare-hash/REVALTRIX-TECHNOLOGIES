import { TenantFeature, TenantType } from '@prisma/client';

export const TENANT_FEATURE_METADATA = 'tenant_feature';

const TENANT_TYPE_FEATURES: Record<TenantType, TenantFeature[]> = {
  HOSPITAL: Object.values(TenantFeature).filter((feature) => feature !== TenantFeature.POS),
  CLINIC: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.ENCOUNTERS,
    TenantFeature.REFERRALS,
    TenantFeature.LABORATORY,
    TenantFeature.RADIOLOGY,
    TenantFeature.PHARMACY,
    TenantFeature.PROCEDURES,
    TenantFeature.TELEHEALTH,
    TenantFeature.INSURANCE,
  ],
  SPECIALIST_PRACTICE: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.ENCOUNTERS,
    TenantFeature.REFERRALS,
    TenantFeature.PROCEDURES,
    TenantFeature.TELEHEALTH,
    TenantFeature.INSURANCE,
  ],
  MEDICAL_CENTER: Object.values(TenantFeature).filter((feature) => {
    const excludedFeatures = new Set<TenantFeature>([
      TenantFeature.DISPATCH,
      TenantFeature.ROUTE_PLANNING,
      TenantFeature.NETWORK,
      TenantFeature.CLAIMS,
    ]);
    return !excludedFeatures.has(feature);
  }),
  DIAGNOSTIC_CENTER: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.REFERRALS,
    TenantFeature.LABORATORY,
    TenantFeature.RADIOLOGY,
    TenantFeature.INSURANCE,
    TenantFeature.CORPORATE,
  ],
  LABORATORY: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.REFERRALS,
    TenantFeature.LABORATORY,
    TenantFeature.INVENTORY,
    TenantFeature.INSURANCE,
    TenantFeature.CORPORATE,
  ],
  RADIOLOGY_CENTER: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.REFERRALS,
    TenantFeature.RADIOLOGY,
    TenantFeature.INSURANCE,
    TenantFeature.CORPORATE,
  ],
  PHARMACY: [
    TenantFeature.QUEUE,
    TenantFeature.PHARMACY,
    TenantFeature.SHOP,
    TenantFeature.INVENTORY,
    TenantFeature.POS,
    TenantFeature.INSURANCE,
    TenantFeature.CORPORATE,
  ],
  DENTAL_CLINIC: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.ENCOUNTERS,
    TenantFeature.REFERRALS,
    TenantFeature.PROCEDURES,
    TenantFeature.DENTAL,
    TenantFeature.SHOP,
    TenantFeature.INVENTORY,
    TenantFeature.INSURANCE,
  ],
  OPTICAL_CENTER: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.ENCOUNTERS,
    TenantFeature.REFERRALS,
    TenantFeature.OPTICAL,
    TenantFeature.SHOP,
    TenantFeature.INVENTORY,
    TenantFeature.POS,
    TenantFeature.INSURANCE,
  ],
  MATERNITY_CENTER: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.ENCOUNTERS,
    TenantFeature.REFERRALS,
    TenantFeature.LABORATORY,
    TenantFeature.RADIOLOGY,
    TenantFeature.PHARMACY,
    TenantFeature.PROCEDURES,
    TenantFeature.THEATRE,
    TenantFeature.TELEHEALTH,
    TenantFeature.MATERNITY,
    TenantFeature.INSURANCE,
    TenantFeature.CORPORATE,
  ],
  REHABILITATION_CENTER: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.ENCOUNTERS,
    TenantFeature.REFERRALS,
    TenantFeature.TELEHEALTH,
    TenantFeature.REHABILITATION,
    TenantFeature.SHOP,
    TenantFeature.INVENTORY,
    TenantFeature.INSURANCE,
    TenantFeature.CORPORATE,
  ],
  HOME_HEALTH_PROVIDER: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.REFERRALS,
    TenantFeature.TELEHEALTH,
    TenantFeature.HOME_VISITS,
    TenantFeature.SHOP,
    TenantFeature.INVENTORY,
    TenantFeature.INSURANCE,
    TenantFeature.CORPORATE,
    TenantFeature.ROUTE_PLANNING,
  ],
  AMBULANCE_PROVIDER: [
    TenantFeature.QUEUE,
    TenantFeature.AMBULANCE,
    TenantFeature.DISPATCH,
    TenantFeature.ROUTE_PLANNING,
    TenantFeature.INSURANCE,
    TenantFeature.CORPORATE,
  ],
  HEALTHCARE_NETWORK: Object.values(TenantFeature).filter(
    (feature) => feature !== TenantFeature.POS,
  ),
  CORPORATE_HEALTH_PROVIDER: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.ENCOUNTERS,
    TenantFeature.REFERRALS,
    TenantFeature.INSURANCE,
    TenantFeature.CORPORATE,
    TenantFeature.CLAIMS,
    TenantFeature.NETWORK,
  ],
  INSURER: [TenantFeature.INSURANCE, TenantFeature.CLAIMS, TenantFeature.NETWORK],
  EXTERNAL_PROVIDER: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.REFERRALS,
    TenantFeature.EXTERNAL_INTEGRATIONS,
    TenantFeature.INSURANCE,
  ],
  OTHER_HEALTHCARE_PROVIDER: [
    TenantFeature.APPOINTMENTS,
    TenantFeature.QUEUE,
    TenantFeature.ENCOUNTERS,
    TenantFeature.REFERRALS,
    TenantFeature.TELEHEALTH,
    TenantFeature.SHOP,
    TenantFeature.INVENTORY,
    TenantFeature.INSURANCE,
  ],
};

export function isFeatureSupportedByTenantType(
  tenantType: TenantType,
  feature: TenantFeature,
): boolean {
  return TENANT_TYPE_FEATURES[tenantType].includes(feature);
}

export function getDefaultTenantFeature(tenantType: TenantType, feature: TenantFeature): boolean {
  if (!isFeatureSupportedByTenantType(tenantType, feature)) {
    return false;
  }

  if (tenantType === TenantType.HOSPITAL && feature === TenantFeature.SHOP) {
    return true;
  }

  return (
    feature !== TenantFeature.SHOP &&
    feature !== TenantFeature.INVENTORY &&
    feature !== TenantFeature.POS
  );
}
