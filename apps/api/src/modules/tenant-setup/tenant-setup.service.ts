import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { TenantSetupStatus, TenantType } from '@prisma/client';

export interface ReadinessRequirement {
  key: string;
  label: string;
  weight: number;
  required: boolean;
  available: boolean;
  complete: boolean;
}

@Injectable()
export class TenantSetupService {
  constructor(private readonly database: DatabaseService) {}

  async getSetup(userId: string) {
    const membership = await this.database.client.membership.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        tenant: {
          status: 'ACTIVE',
        },
      },
      select: {
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            legalName: true,
            type: true,
            status: true,
            profile: true,
            setup: true,
            _count: {
              select: {
                branches: true,
                departments: true,
                memberships: true,
              },
            },
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

    const [serviceCount, providerCount, administratorCount, branchCount, documents] =
      await Promise.all([
        this.database.client.service.count({
          where: {
            tenantId: membership.tenantId,
            status: 'ACTIVE',
            deletedAt: null,
          },
        }),
        this.database.client.providerProfile.count({
          where: {
            tenantId: membership.tenantId,
            status: 'ACTIVE',
            deletedAt: null,
          },
        }),
        this.database.client.membership.count({
          where: {
            tenantId: membership.tenantId,
            status: 'ACTIVE',
            startsAt: {
              lte: new Date(),
            },
            OR: [
              {
                endsAt: null,
              },
              {
                endsAt: {
                  gt: new Date(),
                },
              },
            ],
            roles: {
              some: {
                role: {
                  code: 'TENANT_ADMIN',
                  status: 'ACTIVE',
                },
              },
            },
          },
        }),
        this.database.client.branch.count({
          where: {
            tenantId: membership.tenantId,
            status: 'ACTIVE',
            deletedAt: null,
          },
        }),
        this.database.client.tenantDocument.findMany({
          where: {
            tenantId: membership.tenantId,
            status: { notIn: ['DRAFT', 'REPLACED'] },
          },
          select: {
            type: true,
            status: true,
            verificationStatus: true,
          },
        }),
      ]);

    const [availabilityCount, serviceProviderLinkCount, verifiedAdministratorCount] =
      await Promise.all([
        this.database.client.providerAvailability.count({
          where: {
            tenantId: membership.tenantId,
            isActive: true,
            provider: {
              is: { status: 'ACTIVE', deletedAt: null },
            },
            branch: {
              is: { status: 'ACTIVE', deletedAt: null },
            },
          },
        }),
        this.database.client.providerAvailability.count({
          where: {
            tenantId: membership.tenantId,
            isActive: true,
            serviceId: { not: null },
            branchId: { not: null },
            provider: {
              is: { status: 'ACTIVE', deletedAt: null },
            },
            service: {
              is: { status: 'ACTIVE', deletedAt: null },
            },
            branch: {
              is: { status: 'ACTIVE', deletedAt: null },
            },
          },
        }),
        this.database.client.membership.count({
          where: {
            tenantId: membership.tenantId,
            status: 'ACTIVE',
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            roles: {
              some: {
                role: {
                  code: 'TENANT_ADMIN',
                  status: 'ACTIVE',
                },
              },
            },
            user: {
              is: {
                AND: [
                  {
                    identities: {
                      some: {
                        type: 'EMAIL',
                        verifiedAt: { not: null },
                        status: 'ACTIVE',
                      },
                    },
                  },
                  {
                    identities: {
                      some: {
                        type: 'PHONE',
                        verifiedAt: { not: null },
                        status: 'ACTIVE',
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
      ]);

    return this.calculateAndPersist(
      membership.tenant,
      serviceCount,
      providerCount,
      administratorCount,
      branchCount,
      documents,
      availabilityCount,
      serviceProviderLinkCount,
      verifiedAdministratorCount,
    );
  }

  async requestActivation(userId: string) {
    const readiness = await this.getSetup(userId);

    if (readiness.setup.status === TenantSetupStatus.LIVE) {
      return {
        accepted: true,
        status: TenantSetupStatus.LIVE,
        message: 'This facility is already accepting appointments.',
      };
    }

    if (!readiness.summary.ready) {
      const incomplete = readiness.requirements
        .filter((requirement) => requirement.required && !requirement.complete)
        .map((requirement) => requirement.label);
      throw new ConflictException({
        message: 'Facility activation is blocked until all required setup is complete.',
        incompleteRequirements: incomplete,
      });
    }

    const membership = await this.database.client.membership.findFirst({
      where: {
        userId,
        tenantId: readiness.tenant.id,
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              code: 'TENANT_ADMIN',
              status: 'ACTIVE',
            },
          },
        },
      },
      select: { tenantId: true },
    });

    if (!membership) {
      throw new ForbiddenException('Only an active tenant administrator can request activation');
    }

    await this.database.client.$transaction(async (tx) => {
      await tx.auditEvent.create({
        data: {
          tenantId: membership.tenantId,
          actorUserId: userId,
          action: 'TENANT_ACTIVATION_REQUESTED',
          resourceType: 'TENANT_SETUP',
          resourceId: readiness.tenant.id,
          outcome: 'SUCCESS',
          reason:
            'Tenant administrator requested facility activation after passing readiness checks',
          metadata: {
            readinessPercent: readiness.setup.readinessPercent,
            completedRequirements: readiness.summary.completed,
            totalRequirements: readiness.summary.total,
          },
        },
      });

      await tx.tenantSetup.update({
        where: { tenantId: membership.tenantId },
        data: {
          status: TenantSetupStatus.READY,
          readyAt: new Date(),
          lastCalculatedAt: new Date(),
        },
      });
    });

    return {
      accepted: true,
      status: TenantSetupStatus.READY,
      message: 'Activation request recorded for platform review.',
    };
  }

  private async calculateAndPersist(
    tenant: {
      id: string;
      name: string;
      legalName: string | null;
      type: TenantType;
      status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
      profile: {
        businessName: string | null;
        legalName: string | null;
        registrationNumber: string | null;
        taxIdentificationNumber: string | null;
        country: string;
        address: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        website: string | null;
      } | null;
      setup: {
        status: TenantSetupStatus;
        readinessPercent: number;
        readyAt: Date | null;
        liveAt: Date | null;
        suspendedAt: Date | null;
      } | null;
      _count: {
        branches: number;
        departments: number;
        memberships: number;
      };
    },
    serviceCount: number,
    providerCount: number,
    administratorCount: number,
    branchCount: number,
    documents: Array<{
      type: string;
      status: string;
      verificationStatus: string;
    }>,
    availabilityCount: number,
    serviceProviderLinkCount: number,
    verifiedAdministratorCount: number,
  ) {
    const requirements = this.buildRequirements(
      tenant,
      serviceCount,
      providerCount,
      administratorCount,
      branchCount,
      documents,
      availabilityCount,
      serviceProviderLinkCount,
      verifiedAdministratorCount,
    );

    const availableRequirements = requirements.filter((requirement) => requirement.available);

    const totalWeight = availableRequirements.reduce(
      (sum, requirement) => sum + requirement.weight,
      0,
    );

    const completedWeight = availableRequirements
      .filter((requirement) => requirement.complete)
      .reduce((sum, requirement) => sum + requirement.weight, 0);

    const readinessPercent =
      totalWeight === 0 ? 0 : Math.round((completedWeight / totalWeight) * 100);

    const allRequiredComplete = requirements
      .filter((requirement) => requirement.required && requirement.available)
      .every((requirement) => requirement.complete);

    let status = tenant.setup?.status ?? TenantSetupStatus.NOT_STARTED;

    if (
      tenant.setup?.status !== TenantSetupStatus.LIVE &&
      tenant.setup?.status !== TenantSetupStatus.SUSPENDED
    ) {
      if (allRequiredComplete) {
        status = TenantSetupStatus.READY;
      } else if (readinessPercent > 0) {
        status = TenantSetupStatus.IN_PROGRESS;
      } else {
        status = TenantSetupStatus.NOT_STARTED;
      }
    }

    const setup = await this.database.client.tenantSetup.upsert({
      where: {
        tenantId: tenant.id,
      },
      create: {
        tenantId: tenant.id,
        status,
        readinessPercent,
        readyAt: allRequiredComplete ? new Date() : null,
        lastCalculatedAt: new Date(),
      },
      update: {
        status,
        readinessPercent,
        readyAt: allRequiredComplete ? (tenant.setup?.readyAt ?? new Date()) : null,
        lastCalculatedAt: new Date(),
      },
    });

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        legalName: tenant.legalName,
        type: tenant.type,
        status: tenant.status,
      },
      setup: {
        status: setup.status,
        readinessPercent: setup.readinessPercent,
        readyAt: setup.readyAt,
        liveAt: setup.liveAt,
      },
      requirements,
      summary: {
        total: requirements.length,
        completed: requirements.filter((item) => item.complete).length,
        required: requirements.filter((item) => item.required).length,
        requiredCompleted: requirements.filter((item) => item.required && item.complete).length,
        ready: allRequiredComplete,
      },
    };
  }

  private buildRequirements(
    tenant: {
      type: TenantType;
      name: string;
      legalName: string | null;
      profile: {
        businessName: string | null;
        legalName: string | null;
        registrationNumber: string | null;
        taxIdentificationNumber: string | null;
        country: string;
        address: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        website: string | null;
      } | null;
      _count: {
        branches: number;
        departments: number;
        memberships: number;
      };
    },
    serviceCount: number,
    providerCount: number,
    administratorCount: number,
    branchCount: number,
    documents: Array<{
      type: string;
      status: string;
      verificationStatus: string;
    }>,
    availabilityCount: number,
    serviceProviderLinkCount: number,
    verifiedAdministratorCount: number,
  ): ReadinessRequirement[] {
    const profile = tenant.profile;

    const requiredDocumentTypes = ['BUSINESS_PERMIT', 'HEALTHCARE_FACILITY_LICENSE'];
    const submittedDocumentTypes = new Set(documents.map((document) => document.type));
    const allSubmittedDocumentsApproved =
      documents.length > 0 &&
      documents.every(
        (document) => document.status === 'VERIFIED' && document.verificationStatus === 'VERIFIED',
      );

    const requirements: ReadinessRequirement[] = [
      {
        key: 'organization_identity',
        label: 'Organization identity',
        weight: 15,
        required: true,
        available: true,
        complete: Boolean(
          tenant.name.trim() &&
          (profile?.businessName?.trim() || tenant.name.trim()) &&
          (profile?.legalName?.trim() || tenant.legalName?.trim()),
        ),
      },
      {
        key: 'legal_information',
        label: 'Legal and registration information',
        weight: 10,
        required: true,
        available: true,
        complete: Boolean(
          profile?.registrationNumber?.trim() && profile?.taxIdentificationNumber?.trim(),
        ),
      },
      {
        key: 'location',
        label: 'Organization location',
        weight: 10,
        required: true,
        available: true,
        complete: Boolean(profile?.country?.trim() && profile?.address?.trim()),
      },
      {
        key: 'official_contacts',
        label: 'Official contact details',
        weight: 10,
        required: true,
        available: true,
        complete: Boolean(profile?.contactEmail?.trim() && profile?.contactPhone?.trim()),
      },
      {
        key: 'administrator',
        label: 'Administrator access',
        weight: 10,
        required: true,
        available: true,
        complete: administratorCount > 0,
      },
      {
        key: 'documents_uploaded',
        label: 'Facility permit and license uploaded',
        weight: 8,
        required: true,
        available: true,
        complete: requiredDocumentTypes.every((type) => submittedDocumentTypes.has(type)),
      },
      {
        key: 'documents_approved',
        label: 'Facility documents approved',
        weight: 8,
        required: true,
        available: true,
        complete: allSubmittedDocumentsApproved,
      },
      {
        key: 'administrator_contacts_verified',
        label: 'Tenant administrator email and phone verified',
        weight: 6,
        required: true,
        available: true,
        complete: verifiedAdministratorCount > 0,
      },
      {
        key: 'owner_identity_verified',
        label: 'Facility owner identity verified',
        weight: 6,
        required: true,
        available: true,
        complete: false,
      },
      {
        key: 'branches',
        label: 'At least one active branch',
        weight: 10,
        required: true,
        available: true,
        complete: branchCount > 0,
      },
      {
        key: 'branch_configuration',
        label: 'Branch address, contact, and operating hours configured',
        weight: 8,
        required: true,
        available: true,
        complete: false,
      },
      {
        key: 'departments',
        label: 'Departments',
        weight: 10,
        required: this.requiresDepartments(tenant.type),
        available: true,
        complete: tenant._count.departments > 0,
      },
      {
        key: 'services',
        label: 'At least one active service',
        weight: 10,
        required: true,
        available: true,
        complete: serviceCount > 0,
      },
      {
        key: 'service_pricing',
        label: 'Service pricing and duration configured',
        weight: 8,
        required: true,
        available: true,
        complete: false,
      },
      {
        key: 'providers',
        label: 'Providers',
        weight: 5,
        required: this.requiresProviders(tenant.type),
        available: true,
        complete: providerCount > 0,
      },
      {
        key: 'provider_calendar',
        label: 'Provider availability configured',
        weight: 8,
        required: this.requiresProviders(tenant.type),
        available: true,
        complete: availabilityCount > 0,
      },
      {
        key: 'service_provider_link',
        label: 'Active service linked to provider and branch',
        weight: 6,
        required: this.requiresProviders(tenant.type),
        available: true,
        complete: serviceProviderLinkCount > 0,
      },
      {
        key: 'resources',
        label: 'Operational resources',
        weight: 5,
        required: this.requiresResources(tenant.type),
        available: false,
        complete: false,
      },
      {
        key: 'booking_rules',
        label: 'Booking and cancellation rules configured',
        weight: 8,
        required: true,
        available: true,
        complete: false,
      },
      {
        key: 'payments',
        label: 'Payment method configured',
        weight: 7,
        required: true,
        available: true,
        complete: false,
      },
      {
        key: 'terms_accepted',
        label: 'Revaltrix terms and privacy policy accepted',
        weight: 4,
        required: true,
        available: true,
        complete: false,
      },
      {
        key: 'test_booking',
        label: 'Test booking, reschedule, cancellation, and reminder passed',
        weight: 5,
        required: true,
        available: true,
        complete: false,
      },
    ];

    return requirements;
  }

  private requiresDepartments(type: TenantType): boolean {
    return (
      type !== TenantType.OPTICAL_CENTER &&
      type !== TenantType.PHARMACY &&
      type !== TenantType.AMBULANCE_PROVIDER
    );
  }

  private requiresProviders(type: TenantType): boolean {
    return type !== TenantType.PHARMACY && type !== TenantType.AMBULANCE_PROVIDER;
  }

  private requiresResources(type: TenantType): boolean {
    return type !== TenantType.OTHER_HEALTHCARE_PROVIDER;
  }
}
