import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IdentityType,
  Prisma,
  RegistrationStatus,
  RegistrationType,
  VerificationStatus,
} from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { VerificationService } from '../verification/verification.service.js';
import { VerificationEmailService } from '../communication/email/verification-email.service.js';
import type { CreateStaffDto } from './dto/create-staff.dto.js';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly verificationService: VerificationService,
    private readonly verificationEmailService: VerificationEmailService,
  ) {}

  async list(userId: string) {
    const tenantId = await this.getTenantIdForUser(userId);
    const staff = await this.database.client.staffProfile.findMany({
      where: {
        tenantId,
        status: { not: 'OFFBOARDED' },
      },
      select: {
        id: true,
        staffNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        jobTitle: true,
        employmentType: true,
        status: true,
        joinedAt: true,
        createdAt: true,
        user: {
          select: {
            identities: {
              where: {
                type: IdentityType.EMAIL,
                status: 'ACTIVE',
              },
              select: {
                verifiedAt: true,
                credentialHash: true,
              },
            },
          },
        },
        assignments: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            role: true,
            accessLevel: true,
            isPrimaryDepartment: true,
            status: true,
            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
          orderBy: { assignedAt: 'asc' },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return staff.map(({ user, ...profile }) => {
      const emailIdentity = user.identities[0];
      return {
        ...profile,
        emailVerified: Boolean(emailIdentity?.verifiedAt),
        passwordConfigured: Boolean(emailIdentity?.credentialHash),
      };
    });
  }

  async getMyProfile(userId: string) {
    const profile = await this.database.client.staffProfile.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        tenant: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
      select: {
        id: true,
        tenantId: true,
        staffNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        jobTitle: true,
        status: true,
        tenant: { select: { id: true, name: true } },
        assignments: {
          where: {
            status: 'ACTIVE',
            department: {
              status: 'ACTIVE',
              deletedAt: null,
            },
          },
          select: {
            id: true,
            role: true,
            accessLevel: true,
            isPrimaryDepartment: true,
            department: {
              select: {
                id: true,
                name: true,
                code: true,
                type: true,
                category: true,
                requiresDepartmentPassword: true,
              },
            },
          },
          orderBy: [{ isPrimaryDepartment: 'desc' }, { assignedAt: 'asc' }],
        },
      },
    });

    if (!profile) {
      return { profile: null, assignments: [] };
    }

    return {
      profile: {
        id: profile.id,
        staffNumber: profile.staffNumber,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        jobTitle: profile.jobTitle,
        status: profile.status,
        tenant: profile.tenant,
      },
      assignments: profile.assignments,
    };
  }

  async create(userId: string, dto: CreateStaffDto) {
    const tenantId = await this.getTenantIdForUser(userId);
    const email = dto.email.trim();
    const normalizedEmail = email.toLowerCase();
    const department = await this.database.client.department.findFirst({
      where: {
        id: dto.departmentId,
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        branchId: true,
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found in this organization');
    }

    const branchId = dto.branchId ?? department.branchId;
    if (branchId) {
      const branch = await this.database.client.branch.findFirst({
        where: {
          id: branchId,
          tenantId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found in this organization');
      }
    }

    const identity = await this.database.client.identity.findUnique({
      where: {
        type_normalizedValue: {
          type: IdentityType.EMAIL,
          normalizedValue: normalizedEmail,
        },
      },
      select: { id: true },
    });
    if (identity) {
      throw new ConflictException('This email address is already registered');
    }

    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const staffNumber = `STF-${Date.now().toString(36).toUpperCase()}-${randomInt(1000, 10000)}`;
    let created: {
      profile: {
        id: string;
        staffNumber: string | null;
        firstName: string;
        lastName: string;
        email: string;
        status: string;
        createdAt: Date;
      };
      userId: string;
    };
    try {
      created = await this.database.client.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { displayName: `${firstName} ${lastName}` },
          select: { id: true },
        });
        await tx.identity.create({
          data: {
            userId: user.id,
            type: IdentityType.EMAIL,
            value: email,
            normalizedValue: normalizedEmail,
          },
        });
        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            tenantId,
            branchId: branchId ?? null,
            departmentId: department.id,
            status: 'ACTIVE',
          },
        });
        const profile = await tx.staffProfile.create({
          data: {
            tenantId,
            userId: user.id,
            departmentId: department.id,
            branchId: branchId ?? null,
            staffNumber,
            firstName,
            lastName,
            email,
            phone: dto.phone?.trim() || null,
            jobTitle: dto.jobTitle?.trim() || null,
            joinedAt: new Date(),
          },
          select: {
            id: true,
            staffNumber: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            createdAt: true,
          },
        });
        await tx.staffDepartmentAssignment.create({
          data: {
            staffProfileId: profile.id,
            departmentId: department.id,
            branchId: branchId ?? null,
            role: dto.role.trim(),
            isPrimaryDepartment: true,
            accessLevel: dto.accessLevel ?? 'OPERATE',
            assignedById: userId,
          },
        });
        await tx.registration.create({
          data: {
            userId: user.id,
            tenantId,
            type: RegistrationType.TENANT,
            status: RegistrationStatus.VERIFICATION_REQUIRED,
            verificationStatus: VerificationStatus.PENDING,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        return { profile, userId: user.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This email address or staff record is already registered');
      }
      throw error;
    }

    try {
      await this.verificationService.createRegistrationVerification(created.userId, 'EMAIL');
      return {
        ...created.profile,
        invitationStatus: 'VERIFICATION_EMAIL_SENT',
      };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 503) {
        return {
          ...created.profile,
          invitationStatus: 'EMAIL_DELIVERY_FAILED',
        };
      }
      throw error;
    }
  }

  async resendInvitation(userId: string, staffProfileId: string) {
    const tenantId = await this.getTenantIdForUser(userId);
    const profile = await this.database.client.staffProfile.findFirst({
      where: {
        id: staffProfileId,
        tenantId,
        status: { not: 'OFFBOARDED' },
      },
      select: {
        id: true,
        userId: true,
        email: true,
        user: {
          select: {
            identities: {
              where: {
                type: IdentityType.EMAIL,
                status: 'ACTIVE',
              },
              select: { verifiedAt: true },
            },
          },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Staff member not found');
    }

    if (!profile.user.identities[0]?.verifiedAt) {
      await this.verificationService.createRegistrationVerification(profile.userId, 'EMAIL');
      return { invitationStatus: 'VERIFICATION_EMAIL_SENT' };
    }

    await this.database.client.registrationSession.updateMany({
      where: {
        userId: profile.userId,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.database.client.registrationSession.create({
      data: {
        userId: profile.userId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt,
      },
    });
    try {
      await this.verificationEmailService.sendStaffPasswordSetup(profile.email, token, expiresAt);
    } catch (error) {
      await this.database.client.registrationSession.updateMany({
        where: {
          userId: profile.userId,
          consumedAt: null,
          tokenHash: createHash('sha256').update(token).digest('hex'),
        },
        data: { consumedAt: new Date() },
      });
      this.logger.error(
        'Staff password setup email could not be delivered',
        error instanceof Error ? error.stack : undefined,
      );
      return { invitationStatus: 'EMAIL_DELIVERY_FAILED' };
    }
    return { invitationStatus: 'PASSWORD_SETUP_EMAIL_SENT' };
  }

  private async getTenantIdForUser(userId: string): Promise<string> {
    const now = new Date();
    const membership = await this.database.client.membership.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        tenant: { status: 'ACTIVE', deletedAt: null },
      },
      select: { tenantId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      throw new NotFoundException('Active organization membership not found');
    }
    return membership.tenantId;
  }
}
