import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  StaffStatus,
  VerificationPurpose,
  VerificationStatus,
} from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { VerificationService } from '../verification/verification.service.js';
import { VerificationEmailService } from '../communication/email/verification-email.service.js';
import type { CreateStaffDto } from './dto/create-staff.dto.js';
import type { AssignStaffDepartmentDto } from './dto/assign-staff-department.dto.js';
import type { CreateStaffShiftDto } from './dto/create-staff-shift.dto.js';

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
      },
      select: {
        id: true,
        hospitalId: true,
        departmentId: true,
        branchId: true,
        reportsToId: true,
        staffNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        profilePhotoUrl: true,
        jobTitle: true,
        employmentType: true,
        licenseNumber: true,
        specialty: true,
        qualifications: true,
        status: true,
        joinedAt: true,
        createdAt: true,
        updatedAt: true,
        branch: { select: { id: true, name: true, code: true } },
        reportsTo: { select: { id: true, firstName: true, lastName: true } },
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
          select: {
            id: true,
            role: true,
            accessLevel: true,
            isPrimaryDepartment: true,
            assignedById: true,
            assignedAt: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            department: {
              select: {
                id: true,
                name: true,
                code: true,
                status: true,
              },
            },
            branch: { select: { id: true, name: true, code: true } },
          },
          orderBy: { assignedAt: 'asc' },
        },
        shifts: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            staffProfileId: true,
            departmentId: true,
            branchId: true,
            shiftName: true,
            startTime: true,
            endTime: true,
            daysOfWeek: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            department: { select: { id: true, name: true, code: true } },
            branch: { select: { id: true, name: true, code: true } },
          },
          orderBy: { createdAt: 'desc' },
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

    if (dto.reportsToId) {
      const manager = await this.database.client.staffProfile.findFirst({
        where: {
          id: dto.reportsToId,
          tenantId,
          status: StaffStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!manager) {
        throw new NotFoundException('Reporting manager not found in this organization');
      }
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
            employmentType: dto.employmentType ?? 'FULL_TIME',
            reportsToId: dto.reportsToId ?? null,
            licenseNumber: dto.licenseNumber?.trim() || null,
            specialty: dto.specialty?.trim() || null,
            qualifications: dto.qualifications?.trim() || null,
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
        if (dto.shiftName?.trim()) {
          if (!dto.shiftStartTime || !dto.shiftEndTime || !dto.shiftDays?.length) {
            throw new BadRequestException(
              'Shift name, start and end times, and at least one shift day are required',
            );
          }
          await tx.staffShift.create({
            data: {
              staffProfileId: profile.id,
              departmentId: department.id,
              branchId: branchId ?? null,
              shiftName: dto.shiftName.trim(),
              startTime: dto.shiftStartTime,
              endTime: dto.shiftEndTime,
              daysOfWeek: dto.shiftDays,
            },
          });
        }
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
        await tx.auditEvent.create({
          data: {
            tenantId,
            actorUserId: userId,
            branchId: branchId ?? null,
            action: 'staff.invited',
            resourceType: 'staff_profile',
            resourceId: profile.id,
            outcome: 'SUCCESS',
            metadata: {
              departmentId: department.id,
              role: dto.role.trim(),
              accessLevel: dto.accessLevel ?? 'OPERATE',
            },
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

    return { invitationStatus: 'ADMIN_APPROVAL_REQUIRED' };
  }

  async approveStaff(userId: string, staffProfileId: string) {
    const tenantId = await this.getTenantIdForUser(userId);
    const profile = await this.database.client.staffProfile.findFirst({
      where: {
        id: staffProfileId,
        tenantId,
        status: StaffStatus.ACTIVE,
      },
      select: {
        id: true,
        userId: true,
        email: true,
        branchId: true,
        user: {
          select: {
            identities: {
              where: { type: IdentityType.EMAIL, status: 'ACTIVE' },
              select: { verifiedAt: true, credentialHash: true },
            },
          },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Active staff member not found');
    }
    const emailIdentity = profile.user.identities[0];
    if (!emailIdentity?.verifiedAt) {
      throw new BadRequestException('Verify the staff email address before approving the account');
    }
    if (emailIdentity.credentialHash) {
      throw new ConflictException('This staff member already has a password configured');
    }
    const registration = await this.database.client.registration.findFirst({
      where: {
        userId: profile.userId,
        tenantId,
        type: RegistrationType.TENANT,
        status: {
          in: [RegistrationStatus.VERIFICATION_REQUIRED, RegistrationStatus.ONBOARDING],
        },
        verificationStatus: VerificationStatus.VERIFIED,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!registration) {
      throw new BadRequestException('Verified staff registration was not found');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.database.client.$transaction(async (tx) => {
      await tx.registrationSession.updateMany({
        where: { userId: profile.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.registrationSession.create({
        data: {
          userId: profile.userId,
          tokenHash,
          expiresAt,
          purpose: VerificationPurpose.REGISTRATION,
        },
      });
      await tx.registration.update({
        where: { id: registration.id },
        data: {
          status: RegistrationStatus.ONBOARDING,
          onboardingStatus: 'IN_PROGRESS',
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId: userId,
          branchId: profile.branchId,
          action: 'staff.registration.approved',
          resourceType: 'staff_profile',
          resourceId: profile.id,
          outcome: 'SUCCESS',
          metadata: { registrationId: registration.id },
        },
      });
    });
    try {
      await this.verificationEmailService.sendStaffPasswordSetup(profile.email, token, expiresAt);
    } catch (error) {
      await this.database.client.registrationSession.updateMany({
        where: {
          userId: profile.userId,
          consumedAt: null,
          tokenHash,
        },
        data: { consumedAt: new Date() },
      });
      this.logger.error(
        'Approved staff password setup email could not be delivered',
        error instanceof Error ? error.stack : undefined,
      );
      throw new HttpException('Password setup email could not be delivered', 503);
    }
    return { approvalStatus: 'APPROVED', passwordSetupEmailStatus: 'SENT' as const };
  }

  async getAccessHistory(userId: string, staffProfileId: string) {
    const tenantId = await this.getTenantIdForUser(userId);
    const staff = await this.database.client.staffProfile.findFirst({
      where: { id: staffProfileId, tenantId },
      select: { id: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    return this.database.client.departmentAccessAttempt.findMany({
      where: { staffProfileId },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        status: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async assignDepartment(userId: string, staffProfileId: string, dto: AssignStaffDepartmentDto) {
    const tenantId = await this.getTenantIdForUser(userId);
    const staff = await this.database.client.staffProfile.findFirst({
      where: { id: staffProfileId, tenantId, status: StaffStatus.ACTIVE },
      select: { id: true, userId: true, branchId: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    const department = await this.database.client.department.findFirst({
      where: {
        id: dto.departmentId,
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, branchId: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found in this organization');
    }
    const branchId = dto.branchId ?? department.branchId ?? staff.branchId;
    await this.validateBranch(tenantId, branchId);
    const isPrimaryDepartment = dto.isPrimaryDepartment ?? false;

    return this.database.client.$transaction(async (tx) => {
      if (isPrimaryDepartment) {
        await tx.staffDepartmentAssignment.updateMany({
          where: { staffProfileId, status: 'ACTIVE' },
          data: { isPrimaryDepartment: false },
        });
      }
      const assignment = await tx.staffDepartmentAssignment.upsert({
        where: {
          staffProfileId_departmentId_role: {
            staffProfileId,
            departmentId: department.id,
            role: dto.role.trim(),
          },
        },
        create: {
          staffProfileId,
          departmentId: department.id,
          branchId,
          role: dto.role.trim(),
          accessLevel: dto.accessLevel,
          isPrimaryDepartment,
          assignedById: userId,
          status: 'ACTIVE',
        },
        update: {
          branchId,
          accessLevel: dto.accessLevel,
          isPrimaryDepartment,
          assignedById: userId,
          assignedAt: new Date(),
          status: 'ACTIVE',
        },
        select: {
          id: true,
          departmentId: true,
          branchId: true,
          role: true,
          accessLevel: true,
          isPrimaryDepartment: true,
          status: true,
        },
      });
      const membership = await tx.membership.findFirst({
        where: {
          userId: staff.userId,
          tenantId,
          departmentId: department.id,
          branchId,
        },
        select: { id: true },
      });
      if (membership) {
        await tx.membership.update({
          where: { id: membership.id },
          data: { status: 'ACTIVE' },
        });
      } else {
        await tx.membership.create({
          data: {
            userId: staff.userId,
            tenantId,
            branchId,
            departmentId: department.id,
            status: 'ACTIVE',
          },
        });
      }
      if (isPrimaryDepartment) {
        await tx.staffProfile.update({
          where: { id: staffProfileId },
          data: { departmentId: department.id, branchId },
        });
      }
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId: userId,
          branchId,
          action: 'staff.department.assigned',
          resourceType: 'staff_department_assignment',
          resourceId: assignment.id,
          outcome: 'SUCCESS',
          metadata: {
            staffProfileId,
            departmentId: department.id,
            role: dto.role.trim(),
            accessLevel: dto.accessLevel,
            isPrimaryDepartment,
          },
        },
      });
      return assignment;
    });
  }

  async createShift(userId: string, staffProfileId: string, dto: CreateStaffShiftDto) {
    const tenantId = await this.getTenantIdForUser(userId);
    const staff = await this.database.client.staffProfile.findFirst({
      where: {
        id: staffProfileId,
        tenantId,
        status: StaffStatus.ACTIVE,
        assignments: {
          some: { departmentId: dto.departmentId, status: 'ACTIVE' },
        },
      },
      select: { id: true, branchId: true },
    });
    if (!staff) {
      throw new ForbiddenException('Staff member must have an active department assignment');
    }
    const department = await this.database.client.department.findFirst({
      where: {
        id: dto.departmentId,
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, branchId: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found in this organization');
    }
    const branchId = dto.branchId ?? department.branchId ?? staff.branchId;
    await this.validateBranch(tenantId, branchId);
    const shift = await this.database.client.$transaction(async (tx) => {
      const created = await tx.staffShift.create({
        data: {
          staffProfileId,
          departmentId: department.id,
          branchId,
          shiftName: dto.shiftName.trim(),
          startTime: dto.startTime,
          endTime: dto.endTime,
          daysOfWeek: dto.daysOfWeek,
          status: dto.status ?? 'ACTIVE',
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId: userId,
          branchId,
          action: 'staff.shift.assigned',
          resourceType: 'staff_shift',
          resourceId: created.id,
          outcome: 'SUCCESS',
          metadata: { staffProfileId, departmentId: department.id },
        },
      });
      return created;
    });
    return shift;
  }

  async updateStatus(userId: string, staffProfileId: string, status: StaffStatus) {
    const tenantId = await this.getTenantIdForUser(userId);
    const staff = await this.database.client.staffProfile.findFirst({
      where: { id: staffProfileId, tenantId },
      select: { id: true, userId: true, branchId: true, status: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    if (staff.status === StaffStatus.OFFBOARDED && status !== StaffStatus.OFFBOARDED) {
      throw new ForbiddenException('Offboarded staff members cannot be reactivated');
    }
    return this.database.client.$transaction(async (tx) => {
      const suspended = status === StaffStatus.SUSPENDED;
      const offboarded = status === StaffStatus.OFFBOARDED;
      const updated = await tx.staffProfile.update({
        where: { id: staffProfileId },
        data: { status },
        select: { id: true, status: true, updatedAt: true },
      });
      if (suspended || offboarded) {
        await tx.staffDepartmentAssignment.updateMany({
          where: { staffProfileId, status: 'ACTIVE' },
          data: { status: offboarded ? 'REVOKED' : 'SUSPENDED' },
        });
        await tx.staffShift.updateMany({
          where: { staffProfileId, status: 'ACTIVE' },
          data: { status: offboarded ? 'INACTIVE' : 'SUSPENDED' },
        });
        await tx.membership.updateMany({
          where: { userId: staff.userId, tenantId, status: 'ACTIVE' },
          data: { status: offboarded ? 'REVOKED' : 'SUSPENDED' },
        });
      } else if (status === StaffStatus.ACTIVE && staff.status !== StaffStatus.ACTIVE) {
        await tx.staffDepartmentAssignment.updateMany({
          where: { staffProfileId, status: 'SUSPENDED' },
          data: { status: 'ACTIVE' },
        });
        await tx.staffShift.updateMany({
          where: { staffProfileId, status: 'SUSPENDED' },
          data: { status: 'ACTIVE' },
        });
        await tx.membership.updateMany({
          where: { userId: staff.userId, tenantId, status: 'SUSPENDED' },
          data: { status: 'ACTIVE' },
        });
      }
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId: userId,
          branchId: staff.branchId,
          action: `staff.status.${status.toLowerCase()}`,
          resourceType: 'staff_profile',
          resourceId: staffProfileId,
          outcome: 'SUCCESS',
          metadata: { previousStatus: staff.status, status },
        },
      });
      return updated;
    });
  }

  async sendPasswordReset(userId: string, staffProfileId: string) {
    const tenantId = await this.getTenantIdForUser(userId);
    const profile = await this.database.client.staffProfile.findFirst({
      where: { id: staffProfileId, tenantId, status: StaffStatus.ACTIVE },
      select: {
        id: true,
        userId: true,
        email: true,
        branchId: true,
        user: {
          select: {
            identities: {
              where: { type: IdentityType.EMAIL, status: 'ACTIVE' },
              select: { verifiedAt: true, normalizedValue: true },
            },
          },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Active staff member not found');
    }
    if (!profile.user.identities[0]?.verifiedAt) {
      throw new BadRequestException('Verify the staff email address before resetting its password');
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.database.client.$transaction(async (tx) => {
      await tx.registrationSession.updateMany({
        where: { userId: profile.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.registrationSession.create({
        data: {
          userId: profile.userId,
          tokenHash,
          expiresAt,
          purpose: VerificationPurpose.PASSWORD_RESET,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId: userId,
          branchId: profile.branchId,
          action: 'staff.password_reset.requested',
          resourceType: 'staff_profile',
          resourceId: profile.id,
          outcome: 'SUCCESS',
        },
      });
    });
    try {
      await this.verificationEmailService.sendStaffPasswordReset(profile.email, token, expiresAt);
    } catch (error) {
      await this.database.client.registrationSession.updateMany({
        where: { userId: profile.userId, tokenHash, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      this.logger.error(
        'Staff password reset email could not be delivered',
        error instanceof Error ? error.stack : undefined,
      );
      throw new HttpException('Password reset email could not be delivered', 503);
    }
    return { resetEmailStatus: 'SENT' as const };
  }

  private async validateBranch(
    tenantId: string,
    branchId: string | null | undefined,
  ): Promise<void> {
    if (!branchId) {
      return;
    }
    const branch = await this.database.client.branch.findFirst({
      where: { id: branchId, tenantId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found in this organization');
    }
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
