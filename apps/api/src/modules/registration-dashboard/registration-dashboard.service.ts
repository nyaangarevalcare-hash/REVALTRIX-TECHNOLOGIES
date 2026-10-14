import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';

@Injectable()
export class RegistrationDashboardService {
  constructor(private readonly database: DatabaseService) {}

  async getDashboard(userId: string) {
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
            displayName: true,
            status: true,
            identities: {
              select: {
                type: true,
                value: true,
                verifiedAt: true,
                status: true,
              },
              orderBy: {
                type: 'asc',
              },
            },
          },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException('No active registration was found for this account');
    }

    const patientProfile =
      registration.type === 'PATIENT'
        ? await this.database.client.patientProfile.findUnique({
            where: {
              userId,
            },
            select: {
              id: true,
              firstName: true,
              secondName: true,
              location: true,
            },
          })
        : null;

    const staffProfile =
      registration.type === 'TENANT' && registration.tenant?.id
        ? await this.database.client.staffProfile.findFirst({
            where: {
              userId,
              tenantId: registration.tenant.id,
              status: 'ACTIVE',
            },
            select: {
              firstName: true,
              lastName: true,
              email: true,
              jobTitle: true,
              staffNumber: true,
            },
          })
        : null;

    const emailIdentity = registration.user.identities.find(
      (identity) => identity.type === 'EMAIL',
    );

    const phoneIdentity = registration.user.identities.find(
      (identity) => identity.type === 'PHONE',
    );

    const activeEmailChallenge = await this.database.client.verificationChallenge.findFirst({
      where: {
        userId,
        channel: 'EMAIL',
        purpose: 'REGISTRATION',
        verifiedAt: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const emailVerified = Boolean(emailIdentity?.verifiedAt);
    const phoneVerified = Boolean(phoneIdentity?.verifiedAt);

    const verificationComplete = registration.verificationStatus === 'VERIFIED';

    const profileComplete =
      registration.type === 'PATIENT'
        ? Boolean(patientProfile?.firstName && patientProfile.secondName && patientProfile.location)
        : staffProfile
          ? Boolean(staffProfile.firstName && staffProfile.lastName && staffProfile.email)
          : Boolean(registration.tenant?.name && registration.tenant?.legalName);

    const emailIdentityId = emailIdentity?.type === 'EMAIL' ? emailIdentity : null;

    const passwordConfigured = await this.database.client.identity.findFirst({
      where: {
        userId,
        type: 'EMAIL',
        status: 'ACTIVE',
        credentialHash: {
          not: null,
        },
      },
      select: {
        id: true,
      },
    });

    const passwordSetupRequired = true;
    const passwordComplete = Boolean(emailIdentityId && passwordConfigured);

    const onboardingComplete = registration.onboardingStatus === 'COMPLETED';

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

      account: {
        id: registration.user.id,
        displayName: registration.user.displayName,
        status: registration.user.status,
      },

      verification: {
        email: {
          address: emailIdentity?.value ?? null,
          verified: emailVerified,
          challengeId: activeEmailChallenge?.id ?? null,
          challengeExpiresAt: activeEmailChallenge?.expiresAt ?? null,
        },
        phone: {
          number: phoneIdentity?.value ?? null,
          verified: phoneVerified,
        },
        complete: verificationComplete,
      },

      profile:
        registration.type === 'PATIENT'
          ? {
              type: 'PATIENT',
              data: patientProfile,
              complete: profileComplete,
            }
          : staffProfile
            ? {
                type: 'STAFF',
                data: staffProfile,
                complete: profileComplete,
              }
            : {
                type: 'TENANT',
                data: registration.tenant,
                complete: profileComplete,
              },

      steps: {
        verification: {
          required: true,
          complete: verificationComplete,
        },
        profile: {
          required: true,
          complete: profileComplete,
        },
        password: {
          required: passwordSetupRequired,
          complete: passwordComplete,
        },
        onboarding: {
          required: true,
          complete: onboardingComplete,
        },
      },

      progress: {
        completed: [
          verificationComplete,
          profileComplete,
          passwordComplete,
          onboardingComplete,
        ].filter(Boolean).length,
        total: 4,
      },
    };
  }
}
