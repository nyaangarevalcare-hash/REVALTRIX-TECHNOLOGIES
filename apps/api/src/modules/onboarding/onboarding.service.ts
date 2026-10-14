import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { AuthenticationService } from '../core/authentication/authentication.service.js';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authenticationService: AuthenticationService,
  ) {}

  async updateTenantOnboarding(
    userId: string,
    input: {
      legalName?: string;
      businessName?: string;
      contactEmail?: string;
      contactPhone?: string;
      website?: string;
      description?: string;
    },
  ) {
    const registration = await this.database.client.registration.findFirst({
      where: {
        userId,
        type: 'TENANT',
        status: {
          in: ['VERIFICATION_REQUIRED', 'ONBOARDING'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!registration?.tenantId) {
      throw new NotFoundException('Tenant registration was not found');
    }

    const tenantData = {
      ...(input.legalName !== undefined ? { legalName: input.legalName.trim() } : {}),
      ...(input.businessName !== undefined ? { name: input.businessName.trim() } : {}),
    };

    const profileData = {
      ...(input.legalName !== undefined ? { legalName: input.legalName.trim() } : {}),
      ...(input.businessName !== undefined ? { businessName: input.businessName.trim() } : {}),
      ...(input.contactEmail !== undefined
        ? { contactEmail: input.contactEmail.trim().toLowerCase() }
        : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone.trim() } : {}),
      ...(input.website !== undefined ? { website: input.website.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    };

    await this.database.client.$transaction(async (tx) => {
      if (Object.keys(tenantData).length > 0) {
        await tx.tenant.update({
          where: {
            id: registration.tenantId!,
          },
          data: tenantData,
        });
      }

      if (Object.keys(profileData).length > 0) {
        await tx.tenantProfile.upsert({
          where: {
            tenantId: registration.tenantId!,
          },
          create: {
            tenantId: registration.tenantId!,
            country: 'Kenya',
            ...profileData,
          },
          update: profileData,
        });
      }

      await tx.registration.update({
        where: {
          id: registration.id,
        },
        data: {
          status: 'ONBOARDING',
          onboardingStatus: 'IN_PROGRESS',
        },
      });
    });

    return this.getMyOnboarding(userId);
  }

  async updatePatientOnboarding(
    userId: string,
    input: {
      firstName?: string;
      secondName?: string;
      location?: string;
    },
  ) {
    const registration = await this.database.client.registration.findFirst({
      where: {
        userId,
        type: 'PATIENT',
        status: {
          in: ['VERIFICATION_REQUIRED', 'ONBOARDING'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Patient registration was not found');
    }

    const existingProfile = await this.database.client.patientProfile.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!existingProfile) {
      throw new NotFoundException('Patient profile was not found');
    }

    const firstName = input.firstName !== undefined ? input.firstName.trim() : undefined;

    const secondName = input.secondName !== undefined ? input.secondName.trim() : undefined;

    const location = input.location !== undefined ? input.location.trim() : undefined;

    const profile = await this.database.client.patientProfile.update({
      where: {
        userId,
      },
      data: {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(secondName !== undefined ? { secondName } : {}),
        ...(location !== undefined ? { location } : {}),
      },
    });

    const currentProfile = await this.database.client.patientProfile.findUnique({
      where: {
        userId,
      },
      select: {
        firstName: true,
        secondName: true,
      },
    });

    if (currentProfile) {
      await this.database.client.user.update({
        where: {
          id: userId,
        },
        data: {
          displayName: `${currentProfile.firstName} ${currentProfile.secondName}`.trim(),
        },
      });
    }

    await this.database.client.registration.update({
      where: {
        id: registration.id,
      },
      data: {
        status: 'ONBOARDING',
        onboardingStatus: 'IN_PROGRESS',
      },
    });

    return {
      profile,
      onboardingStatus: 'IN_PROGRESS',
    };
  }

  async completeOnboarding(userId: string, registrationSessionId: string) {
    const registration = await this.database.client.registration.findFirst({
      where: {
        userId,
        status: {
          in: ['VERIFICATION_REQUIRED', 'ONBOARDING'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        type: true,
        verificationStatus: true,
        onboardingStatus: true,
        tenantId: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Active registration was not found');
    }

    if (registration.verificationStatus !== 'VERIFIED') {
      throw new ConflictException(
        'Account verification must be completed before onboarding can be completed',
      );
    }

    const emailIdentity = await this.database.client.identity.findFirst({
      where: {
        userId,
        type: 'EMAIL',
        status: 'ACTIVE',
      },
      select: {
        verifiedAt: true,
        credentialHash: true,
      },
    });

    if (!emailIdentity?.verifiedAt) {
      throw new ConflictException(
        'Email verification must be completed before onboarding can be completed',
      );
    }

    if (!emailIdentity.credentialHash) {
      throw new ConflictException(
        'Account password must be configured before onboarding can be completed',
      );
    }

    if (registration.type === 'PATIENT') {
      const profile = await this.database.client.patientProfile.findUnique({
        where: {
          userId,
        },
        select: {
          firstName: true,
          secondName: true,
          location: true,
        },
      });

      if (!profile?.firstName?.trim() || !profile.secondName?.trim() || !profile.location?.trim()) {
        throw new ConflictException(
          'Patient profile must be completed before onboarding can be completed',
        );
      }
    }

    if (registration.type === 'TENANT') {
      const staffProfile = registration.tenantId
        ? await this.database.client.staffProfile.findFirst({
            where: {
              userId,
              tenantId: registration.tenantId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : null;

      if (!staffProfile) {
        const tenant = registration.tenantId
          ? await this.database.client.tenant.findUnique({
              where: {
                id: registration.tenantId,
              },
              select: {
                name: true,
                legalName: true,
              },
            })
          : null;

        if (!tenant?.name?.trim() || !tenant.legalName?.trim()) {
          throw new ConflictException(
            'Organization profile must be completed before onboarding can be completed',
          );
        }
      }
    }

    return this.database.client.$transaction(async (transaction) => {
      const current = await transaction.registration.findUnique({
        where: {
          id: registration.id,
        },
        select: {
          status: true,
          verificationStatus: true,
          onboardingStatus: true,
        },
      });

      if (!current) {
        throw new NotFoundException('Registration was not found');
      }

      if (current.status === 'COMPLETED' && current.onboardingStatus === 'COMPLETED') {
        throw new ConflictException('Registration has already been completed');
      }

      if (!['VERIFICATION_REQUIRED', 'ONBOARDING'].includes(current.status)) {
        throw new ConflictException('Registration is no longer eligible for onboarding completion');
      }

      if (current.verificationStatus !== 'VERIFIED') {
        throw new ConflictException(
          'Account verification must be completed before onboarding can be completed',
        );
      }

      const registrationSession = await transaction.registrationSession.findUnique({
        where: {
          id: registrationSessionId,
        },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          consumedAt: true,
        },
      });

      if (
        !registrationSession ||
        registrationSession.userId !== userId ||
        registrationSession.consumedAt !== null ||
        registrationSession.expiresAt <= new Date()
      ) {
        throw new ConflictException('Registration session is invalid or expired');
      }

      const authenticatedSession = await this.authenticationService.createAuthenticatedSession(
        transaction,
        userId,
      );

      await transaction.registration.update({
        where: {
          id: registration.id,
        },
        data: {
          status: 'COMPLETED',
          onboardingStatus: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      const consumed = await transaction.registrationSession.updateMany({
        where: {
          id: registrationSessionId,
          userId,
          consumedAt: null,
        },
        data: {
          consumedAt: new Date(),
        },
      });

      if (consumed.count !== 1) {
        throw new ConflictException('Registration session has already been consumed');
      }

      return {
        registration: {
          id: registration.id,
          type: registration.type,
          status: 'COMPLETED' as const,
          verificationStatus: 'VERIFIED' as const,
          onboardingStatus: 'COMPLETED' as const,
        },
        onboardingStatus: 'COMPLETED' as const,
        completed: true as const,
        userId,
        authentication: authenticatedSession,
      };
    });
  }

  private async getCompletedOnboarding(userId: string, registrationId: string) {
    const registration = await this.database.client.registration.findUnique({
      where: {
        id: registrationId,
      },
      select: {
        id: true,
        type: true,
        status: true,
        verificationStatus: true,
        onboardingStatus: true,
        completedAt: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Completed registration was not found');
    }

    return {
      registration,
      onboardingStatus: registration.onboardingStatus,
      completed: true,
      userId,
    };
  }

  async getMyOnboarding(userId: string) {
    const registration = await this.database.client.registration.findFirst({
      where: {
        userId,
        status: {
          in: ['INITIATED', 'VERIFICATION_REQUIRED', 'ONBOARDING'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        type: true,
        status: true,
        verificationStatus: true,
        onboardingStatus: true,
        completedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        tenant: {
          select: {
            id: true,
            type: true,
            name: true,
            legalName: true,
            code: true,
            status: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            status: true,
            identities: {
              select: {
                id: true,
                type: true,
                value: true,
                normalizedValue: true,
                verifiedAt: true,
                status: true,
              },
            },
            patientProfile: {
              select: {
                id: true,
                firstName: true,
                secondName: true,
                location: true,
                createdAt: true,
                updatedAt: true,
              },
            },
            memberships: {
              where: {
                status: 'ACTIVE',
              },
              select: {
                id: true,
                tenantId: true,
                branchId: true,
                departmentId: true,
                status: true,
                startsAt: true,
                endsAt: true,
                roles: {
                  select: {
                    role: {
                      select: {
                        id: true,
                        name: true,
                        code: true,
                        scope: true,
                        status: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException('Active registration was not found');
    }

    return {
      registration: {
        id: registration.id,
        type: registration.type,
        status: registration.status,
        verificationStatus: registration.verificationStatus,
        onboardingStatus: registration.onboardingStatus,
        completedAt: registration.completedAt,
        expiresAt: registration.expiresAt,
        createdAt: registration.createdAt,
        updatedAt: registration.updatedAt,
      },
      user: registration.user,
      tenant: registration.tenant,
    };
  }
}
