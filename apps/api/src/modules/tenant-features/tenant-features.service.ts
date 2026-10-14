import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TenantFeature } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  getDefaultTenantFeature,
  isFeatureSupportedByTenantType,
} from '../authorization/tenant-features.js';
import { TenantFeatureSettingsService } from '../authorization/tenant-feature-settings.service.js';

@Injectable()
export class TenantFeaturesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly tenantFeatureSettings: TenantFeatureSettingsService,
  ) {}

  canManage(userId: string): Promise<boolean> {
    return this.authorization.hasPlatformPermission(userId, {
      resource: 'tenant_features',
      action: 'update',
    });
  }

  async listForUser(userId: string) {
    const context = await this.authorization.getContext(userId);
    const tenant = await this.database.client.tenant.findUnique({
      where: { id: context.tenantId },
      select: { type: true },
    });
    if (!tenant) {
      throw new NotFoundException('Active tenant could not be resolved');
    }

    const settingsAvailable = await this.tenantFeatureSettings.isAvailable();
    const settings = settingsAvailable
      ? await this.database.client.tenantFeatureSetting.findMany({
          where: { tenantId: context.tenantId },
          select: { feature: true, enabled: true },
        })
      : [];
    const overrides = new Map(settings.map(({ feature, enabled }) => [feature, enabled]));

    return Object.values(TenantFeature).map((feature) => {
      const supported = isFeatureSupportedByTenantType(tenant.type, feature);
      return {
        feature,
        supported,
        enabled: supported
          ? (overrides.get(feature) ?? getDefaultTenantFeature(tenant.type, feature))
          : false,
        overridden: overrides.has(feature),
      };
    });
  }

  async setForTenant(input: {
    tenantId: string;
    feature: TenantFeature;
    enabled: boolean;
    actorUserId: string;
  }) {
    const tenant = await this.database.client.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true, type: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!isFeatureSupportedByTenantType(tenant.type, input.feature)) {
      throw new BadRequestException('This feature is not supported for the selected tenant type.');
    }

    if (!(await this.tenantFeatureSettings.isAvailable())) {
      throw new ServiceUnavailableException(
        'Tenant module overrides are unavailable until the tenant feature database migration is applied.',
      );
    }

    return this.database.client.$transaction(async (tx) => {
      const setting = await tx.tenantFeatureSetting.upsert({
        where: {
          tenantId_feature: {
            tenantId: input.tenantId,
            feature: input.feature,
          },
        },
        create: {
          tenantId: input.tenantId,
          feature: input.feature,
          enabled: input.enabled,
          updatedByUserId: input.actorUserId,
        },
        update: {
          enabled: input.enabled,
          updatedByUserId: input.actorUserId,
        },
      });

      await tx.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'TENANT_FEATURE_UPDATED',
          resourceType: 'TENANT_FEATURE',
          resourceId: setting.id,
          outcome: 'SUCCESS',
          metadata: {
            feature: input.feature,
            enabled: input.enabled,
          },
        },
      });

      return setting;
    });
  }
}
