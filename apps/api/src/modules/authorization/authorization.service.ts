import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantFeature } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { getDefaultTenantFeature, isFeatureSupportedByTenantType } from './tenant-features.js';
import { TenantFeatureSettingsService } from './tenant-feature-settings.service.js';
import type { AuthorizationContext, RequiredPermission } from './types/authorization.types.js';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantFeatureSettings: TenantFeatureSettingsService,
  ) {}

  async getContext(userId: string): Promise<AuthorizationContext> {
    const now = new Date();

    const membership = await this.database.client.membership.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        startsAt: {
          lte: now,
        },
        OR: [
          {
            endsAt: null,
          },
          {
            endsAt: {
              gt: now,
            },
          },
        ],
        tenant: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        departmentId: true,
        roles: {
          where: {
            role: {
              status: 'ACTIVE',
            },
          },
          select: {
            roleId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!membership) {
      throw new NotFoundException('Active tenant membership not found');
    }

    return {
      userId,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      branchId: membership.branchId,
      departmentId: membership.departmentId,
      roleIds: membership.roles.map((membershipRole) => membershipRole.roleId),
    };
  }

  async hasPermission(userId: string, required: RequiredPermission): Promise<boolean> {
    const context = await this.getContext(userId);

    if (!(await this.hasTenantFeature(context.tenantId, required.resource))) {
      return false;
    }

    if (context.roleIds.length === 0) {
      return false;
    }

    const permissions = await this.database.client.permission.findMany({
      where: {
        resource: required.resource,
        action: required.action,
        scope: 'TENANT',
        status: 'ACTIVE',
        OR: [{ tenantId: null }, { tenantId: context.tenantId }],
        roles: {
          some: {
            roleId: {
              in: context.roleIds,
            },
          },
        },
      },
      select: {
        effect: true,
      },
    });

    if (permissions.some((permission) => permission.effect === 'DENY')) {
      return false;
    }

    return permissions.some((permission) => permission.effect === 'ALLOW');
  }

  async assertPermission(
    userId: string,
    required: RequiredPermission,
  ): Promise<AuthorizationContext> {
    const context = await this.getContext(userId);

    if (!(await this.hasTenantFeature(context.tenantId, required.resource))) {
      throw new ForbiddenException('This module is not available for your tenant type.');
    }

    if (context.roleIds.length === 0) {
      throw new ForbiddenException('No active role is assigned to this membership');
    }

    const permissions = await this.database.client.permission.findMany({
      where: {
        resource: required.resource,
        action: required.action,
        scope: 'TENANT',
        status: 'ACTIVE',
        OR: [
          {
            tenantId: null,
          },
          {
            tenantId: context.tenantId,
          },
        ],
        roles: {
          some: {
            roleId: {
              in: context.roleIds,
            },
          },
        },
      },
      select: {
        effect: true,
      },
    });

    if (permissions.some((permission) => permission.effect === 'DENY')) {
      throw new ForbiddenException('Permission denied');
    }

    if (!permissions.some((permission) => permission.effect === 'ALLOW')) {
      throw new ForbiddenException('Permission denied');
    }

    return context;
  }

  async assertFeatureAvailable(userId: string, resource: string, tenantId?: string): Promise<void> {
    if (tenantId) {
      const now = new Date();
      const membership = await this.database.client.membership.findFirst({
        where: {
          userId,
          tenantId,
          status: 'ACTIVE',
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          tenant: { status: 'ACTIVE', deletedAt: null },
        },
        select: { id: true },
      });
      if (!membership) {
        throw new ForbiddenException('Active organization membership is required');
      }
    }
    const featureTenantId = tenantId ?? (await this.getContext(userId)).tenantId;
    if (!(await this.hasTenantFeature(featureTenantId, resource))) {
      throw new ForbiddenException('This module is not available for your tenant type.');
    }
  }

  async hasExplicitDeny(
    userId: string,
    required: RequiredPermission,
    tenantId?: string,
  ): Promise<boolean> {
    let roleIds: string[];
    if (tenantId) {
      const membership = await this.database.client.membership.findFirst({
        where: {
          userId,
          tenantId,
          status: 'ACTIVE',
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          tenant: { status: 'ACTIVE', deletedAt: null },
        },
        select: {
          roles: {
            where: { role: { status: 'ACTIVE' } },
            select: { roleId: true },
          },
        },
      });
      roleIds = membership?.roles.map((role) => role.roleId) ?? [];
    } else {
      roleIds = (await this.getContext(userId)).roleIds;
    }
    if (roleIds.length === 0) {
      return false;
    }
    const permissionTenantId = tenantId ?? (await this.getContext(userId)).tenantId;
    const permissions = await this.database.client.permission.findMany({
      where: {
        resource: required.resource,
        action: required.action,
        scope: 'TENANT',
        status: 'ACTIVE',
        OR: [{ tenantId: null }, { tenantId: permissionTenantId }],
        effect: 'DENY',
        roles: { some: { roleId: { in: roleIds } } },
      },
      select: { id: true },
    });
    return permissions.length > 0;
  }

  async hasPlatformPermission(userId: string, required: RequiredPermission): Promise<boolean> {
    const permissions = await this.database.client.permission.findMany({
      where: {
        resource: required.resource,
        action: required.action,
        scope: 'PLATFORM',
        tenantId: null,
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              tenantId: null,
              scope: 'PLATFORM',
              status: 'ACTIVE',
              platformAssignments: {
                some: {
                  userId,
                },
              },
            },
          },
        },
      },
      select: {
        effect: true,
      },
    });

    if (permissions.some((permission) => permission.effect === 'DENY')) {
      return false;
    }

    return permissions.some((permission) => permission.effect === 'ALLOW');
  }

  async assertPlatformPermission(userId: string, required: RequiredPermission): Promise<void> {
    const permissions = await this.database.client.permission.findMany({
      where: {
        resource: required.resource,
        action: required.action,
        scope: 'PLATFORM',
        tenantId: null,
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              tenantId: null,
              scope: 'PLATFORM',
              status: 'ACTIVE',
              platformAssignments: {
                some: {
                  userId,
                },
              },
            },
          },
        },
      },
      select: {
        effect: true,
      },
    });

    if (permissions.some((permission) => permission.effect === 'DENY')) {
      throw new ForbiddenException('Platform permission denied');
    }

    if (!permissions.some((permission) => permission.effect === 'ALLOW')) {
      throw new ForbiddenException('Platform permission denied');
    }
  }

  private async hasTenantFeature(tenantId: string, resource: string): Promise<boolean> {
    const feature = this.featureForResource(resource);
    if (!feature) {
      return true;
    }

    const tenant = await this.database.client.tenant.findUnique({
      where: { id: tenantId },
      select: { type: true },
    });
    if (!tenant || !isFeatureSupportedByTenantType(tenant.type, feature)) {
      return false;
    }

    if (!(await this.tenantFeatureSettings.isAvailable())) {
      return getDefaultTenantFeature(tenant.type, feature);
    }

    const setting = await this.database.client.tenantFeatureSetting.findUnique({
      where: {
        tenantId_feature: { tenantId, feature },
      },
      select: { enabled: true },
    });

    return setting?.enabled ?? getDefaultTenantFeature(tenant.type, feature);
  }

  private featureForResource(resource: string): TenantFeature | null {
    const features: Record<string, TenantFeature> = {
      appointments: TenantFeature.APPOINTMENTS,
      queues: TenantFeature.QUEUE,
      encounters: TenantFeature.ENCOUNTERS,
      referrals: TenantFeature.REFERRALS,
      laboratory: TenantFeature.LABORATORY,
      radiology: TenantFeature.RADIOLOGY,
      pharmacy: TenantFeature.PHARMACY,
      procedures: TenantFeature.PROCEDURES,
      theatre: TenantFeature.THEATRE,
      telemedicine: TenantFeature.TELEHEALTH,
      'home-visits': TenantFeature.HOME_VISITS,
      ambulance: TenantFeature.AMBULANCE,
      shop: TenantFeature.SHOP,
      inventory: TenantFeature.INVENTORY,
      pos: TenantFeature.POS,
      insurance: TenantFeature.INSURANCE,
      corporate: TenantFeature.CORPORATE,
      claims: TenantFeature.CLAIMS,
      dispatch: TenantFeature.DISPATCH,
      'route-planning': TenantFeature.ROUTE_PLANNING,
      maternity: TenantFeature.MATERNITY,
      rehabilitation: TenantFeature.REHABILITATION,
      optical: TenantFeature.OPTICAL,
      dental: TenantFeature.DENTAL,
      network: TenantFeature.NETWORK,
      integrations: TenantFeature.EXTERNAL_INTEGRATIONS,
    };

    return features[resource] ?? null;
  }
}
