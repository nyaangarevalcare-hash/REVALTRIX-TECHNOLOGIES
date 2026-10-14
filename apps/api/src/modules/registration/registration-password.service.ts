import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  IdentityType,
  OnboardingStatus,
  RecordStatus,
  RegistrationType,
  RegistrationStatus,
  VerificationPurpose,
  VerificationStatus,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { CredentialProvisioningService } from '../core/authentication/credential-provisioning.service.js';
import { AuthenticationService } from '../core/authentication/authentication.service.js';
import { PasswordService } from '../core/authentication/password.service.js';

@Injectable()
export class RegistrationPasswordService {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentialProvisioning: CredentialProvisioningService,
    private readonly authenticationService: AuthenticationService,
    private readonly passwordService: PasswordService,
  ) {}

  async setPassword(
    userId: string,
    registrationSessionId: string,
    purpose: string,
    password: string,
    confirmPassword: string,
  ) {
    if (purpose !== VerificationPurpose.REGISTRATION) {
      throw new UnauthorizedException('A registration session is required to set this password');
    }
    if (password !== confirmPassword) {
      throw new ConflictException('Passwords do not match');
    }

    const registration = await this.database.client.registration.findFirst({
      where: {
        userId,
        status: {
          in: [
            RegistrationStatus.INITIATED,
            RegistrationStatus.VERIFICATION_REQUIRED,
            RegistrationStatus.ONBOARDING,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        verificationStatus: true,
        onboardingStatus: true,
      },
    });
    if (!registration) {
      throw new NotFoundException('No active registration was found for this account');
    }
    if (registration.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new UnauthorizedException('Email verification is required before setting a password');
    }

    const emailIdentity = await this.database.client.identity.findFirst({
      where: { userId, type: IdentityType.EMAIL, status: RecordStatus.ACTIVE },
      select: { id: true, value: true, verifiedAt: true, credentialHash: true },
    });
    if (!emailIdentity) {
      throw new NotFoundException('No active email identity was found for this account');
    }
    if (!emailIdentity.verifiedAt) {
      throw new UnauthorizedException('Email verification is required before setting a password');
    }
    if (emailIdentity.credentialHash) {
      throw new ConflictException('A password has already been configured for this account');
    }

    const staffProfile =
      registration.type === RegistrationType.TENANT
        ? await this.database.client.staffProfile.findFirst({
            where: {
              userId,
              tenant: { status: 'ACTIVE', deletedAt: null },
              status: 'ACTIVE',
            },
            select: { id: true, tenantId: true },
          })
        : null;

    if (staffProfile) {
      if (registration.status !== RegistrationStatus.ONBOARDING) {
        throw new UnauthorizedException(
          'An organization administrator must approve your verified staff account first',
        );
      }
      const credentialHash = await this.passwordService.hash(password);
      return this.database.client.$transaction(async (tx) => {
        const consumed = await tx.registrationSession.updateMany({
          where: {
            id: registrationSessionId,
            userId,
            purpose: VerificationPurpose.REGISTRATION,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) {
          throw new UnauthorizedException('Password setup link has already been used or expired');
        }

        const identityUpdate = await tx.identity.updateMany({
          where: {
            id: emailIdentity.id,
            userId,
            credentialHash: null,
            verifiedAt: { not: null },
          },
          data: { credentialHash },
        });
        if (identityUpdate.count !== 1) {
          throw new ConflictException('A password has already been configured for this account');
        }

        await tx.registration.update({
          where: { id: registration.id },
          data: {
            status: RegistrationStatus.COMPLETED,
            onboardingStatus: OnboardingStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        await tx.auditEvent.create({
          data: {
            tenantId: staffProfile.tenantId,
            actorUserId: userId,
            action: 'staff.password_setup.completed',
            resourceType: 'staff_profile',
            resourceId: staffProfile.id,
            outcome: 'SUCCESS',
          },
        });
        const authentication = await this.authenticationService.createAuthenticatedSession(
          tx,
          userId,
        );
        return {
          passwordConfigured: true,
          registrationId: registration.id,
          registrationType: registration.type,
          registrationStatus: RegistrationStatus.COMPLETED,
          verificationStatus: registration.verificationStatus,
          onboardingStatus: OnboardingStatus.COMPLETED,
          authentication,
        };
      });
    }

    await this.credentialProvisioning.setPasswordCredential(
      userId,
      IdentityType.EMAIL,
      emailIdentity.value,
      password,
    );
    const updatedRegistration = await this.database.client.registration.update({
      where: { id: registration.id },
      data: {
        status: RegistrationStatus.ONBOARDING,
        onboardingStatus: OnboardingStatus.IN_PROGRESS,
      },
      select: {
        id: true,
        type: true,
        status: true,
        verificationStatus: true,
        onboardingStatus: true,
      },
    });
    return {
      passwordConfigured: true,
      registrationId: updatedRegistration.id,
      registrationType: updatedRegistration.type,
      registrationStatus: updatedRegistration.status,
      verificationStatus: updatedRegistration.verificationStatus,
      onboardingStatus: updatedRegistration.onboardingStatus,
    };
  }

  async resetStaffPassword(
    userId: string,
    registrationSessionId: string,
    purpose: string,
    password: string,
    confirmPassword: string,
  ) {
    if (purpose !== VerificationPurpose.PASSWORD_RESET) {
      throw new UnauthorizedException('A password reset link is required');
    }
    if (password !== confirmPassword) {
      throw new ConflictException('Passwords do not match');
    }

    const emailIdentity = await this.database.client.identity.findFirst({
      where: {
        userId,
        type: IdentityType.EMAIL,
        status: RecordStatus.ACTIVE,
        verifiedAt: { not: null },
      },
      select: { id: true },
    });
    const profile = await this.database.client.staffProfile.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, tenantId: true },
    });
    if (!emailIdentity || !profile) {
      throw new UnauthorizedException('Password reset is only available to active verified staff');
    }

    const credentialHash = await this.passwordService.hash(password);
    await this.database.client.$transaction(async (tx) => {
      const consumed = await tx.registrationSession.updateMany({
        where: {
          id: registrationSessionId,
          userId,
          purpose: VerificationPurpose.PASSWORD_RESET,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('Password reset link has already been used or expired');
      }
      await tx.identity.update({
        where: { id: emailIdentity.id },
        data: { credentialHash },
      });
      await tx.session.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: profile.tenantId,
          actorUserId: userId,
          action: 'staff.password_reset.completed',
          resourceType: 'staff_profile',
          resourceId: profile.id,
          outcome: 'SUCCESS',
        },
      });
    });
    return { passwordConfigured: true };
  }

  async getPasswordStatus(userId: string) {
    const identity = await this.database.client.identity.findFirst({
      where: {
        userId,
        type: IdentityType.EMAIL,
        status: RecordStatus.ACTIVE,
      },
      select: { credentialHash: true },
    });
    return { configured: Boolean(identity?.credentialHash) };
  }
}
