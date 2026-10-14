import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../database/database.service.js';
import { PasswordService } from '../core/authentication/password.service.js';
import { SessionService } from '../core/sessions/session.service.js';
import type { AuthenticatedRequest } from '../core/authentication/guards/access-token.guard.js';
import type { AccessDepartmentDto } from './dto/access-department.dto.js';
import type { CreateDepartmentDto } from './dto/create-department.dto.js';
import type { UpdateDepartmentDto } from './dto/update-department.dto.js';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly sessionService: SessionService,
  ) {}

  async list(userId: string) {
    const tenantId = await this.getTenantIdForUser(userId);

    return this.database.client.department.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        category: true,
        description: true,
        status: true,
        requiresDepartmentPassword: true,
        organizationId: true,
        branchId: true,
        parentId: true,
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        parent: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            children: true,
            memberships: true,
            services: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        {
          name: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async getById(userId: string, departmentId: string) {
    const tenantId = await this.getTenantIdForUser(userId);

    const department = await this.database.client.department.findFirst({
      where: {
        id: departmentId,
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        category: true,
        description: true,
        status: true,
        requiresDepartmentPassword: true,
        organizationId: true,
        branchId: true,
        parentId: true,
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        parent: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        children: {
          where: {
            status: 'ACTIVE',
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
          },
          orderBy: {
            name: 'asc',
          },
        },
        _count: {
          select: {
            children: true,
            memberships: true,
            services: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  async create(userId: string, dto: CreateDepartmentDto) {
    const tenantId = await this.getTenantIdForUser(userId);

    const name = dto.name.trim();
    const code = dto.code.trim().toUpperCase();
    const normalizedType = this.normalizeDepartmentType(dto.type);
    const normalizedCategory = this.normalizeDepartmentCategory(dto.category);

    await this.ensureUniqueCode(tenantId, code);

    await this.validateReferences(tenantId, dto.organizationId, dto.branchId, dto.parentId);

    const departmentPassword = dto.departmentPassword?.trim();
    const shouldRequireDepartmentPassword =
      dto.requiresDepartmentPassword ?? Boolean(departmentPassword);
    if (shouldRequireDepartmentPassword && !departmentPassword) {
      throw new BadRequestException('Set a department password before requiring password access');
    }
    const generatedBlueprint = this.generateDepartmentBlueprint(
      normalizedType,
      normalizedCategory,
      shouldRequireDepartmentPassword,
    );

    return this.database.client.$transaction(async (tx) => {
      const departmentData: any = {
        tenantId,
        name,
        code,
        slug: this.toSlug(name),
        type: normalizedType,
        category: normalizedCategory,
        shortName: dto.shortName?.trim() || null,
        description: dto.description?.trim() || null,
        status: (dto.status as any) || 'ACTIVE',
        organizationId: dto.organizationId ?? null,
        branchId: dto.branchId ?? null,
        parentId: dto.parentId ?? null,
        requiresDepartmentPassword: shouldRequireDepartmentPassword,
        autoGeneratedFeatures: generatedBlueprint.autoGeneratedFeatures,
        dashboardConfig: generatedBlueprint.dashboardConfig,
        sidebarConfig: generatedBlueprint.sidebarConfig,
        workflowConfig: generatedBlueprint.workflowConfig,
        settings: generatedBlueprint.settings,
      };

      if (departmentPassword) {
        departmentData.departmentPasswordHash = await this.passwordService.hash(departmentPassword);
        departmentData.departmentPasswordSetAt = new Date();
      }

      const department = await tx.department.create({
        data: departmentData,
        select: {
          id: true,
          name: true,
          code: true,
          type: true,
          category: true,
          description: true,
          status: true,
          organizationId: true,
          branchId: true,
          parentId: true,
          requiresDepartmentPassword: true,
          autoGeneratedFeatures: true,
          dashboardConfig: true,
          sidebarConfig: true,
          workflowConfig: true,
          settings: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.queue.create({
        data: {
          tenantId,
          branchId: department.branchId,
          departmentId: department.id,
          name: `${department.name} Queue`,
          code: `D-${department.id}`,
          description: `Automatically managed queue for ${department.name}.`,
          status: 'ACTIVE',
        },
      });

      return department;
    });
  }

  async update(userId: string, departmentId: string, dto: UpdateDepartmentDto) {
    const tenantId = await this.getTenantIdForUser(userId);

    const existing = await this.database.client.department.findFirst({
      where: {
        id: departmentId,
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        organizationId: true,
        branchId: true,
        parentId: true,
        departmentPasswordHash: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Department not found');
    }

    const organizationId =
      dto.organizationId !== undefined ? dto.organizationId : existing.organizationId;

    const branchId = dto.branchId !== undefined ? dto.branchId : existing.branchId;

    const parentId = dto.parentId !== undefined ? dto.parentId : existing.parentId;

    const normalizedType = this.normalizeDepartmentType(dto.type ?? undefined);
    const normalizedCategory = this.normalizeDepartmentCategory(dto.category ?? undefined);

    const data: any = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();

      if (code !== existing.code) {
        await this.ensureUniqueCode(tenantId, code);
      }

      data.code = code;
    }

    if (dto.type !== undefined) {
      data.type = dto.type ? normalizedType : null;
    }

    if (dto.category !== undefined) {
      data.category = dto.category ? normalizedCategory : null;
    }

    if (dto.description !== undefined) {
      data.description = dto.description ? dto.description.trim() : null;
    }

    if (dto.departmentPassword !== undefined) {
      const passwordValue = dto.departmentPassword?.trim();
      if (passwordValue) {
        data.departmentPasswordHash = await this.passwordService.hash(passwordValue);
        data.departmentPasswordSetAt = new Date();
      } else if (dto.departmentPassword === null) {
        data.departmentPasswordHash = null;
        data.departmentPasswordSetAt = null;
        if (dto.requiresDepartmentPassword == null) {
          data.requiresDepartmentPassword = false;
        }
      }
    }

    if (dto.requiresDepartmentPassword !== undefined && dto.requiresDepartmentPassword !== null) {
      if (
        dto.requiresDepartmentPassword &&
        !dto.departmentPassword?.trim() &&
        (dto.departmentPassword === null || !existing.departmentPasswordHash)
      ) {
        throw new BadRequestException('Set a department password before requiring password access');
      }
      data.requiresDepartmentPassword = dto.requiresDepartmentPassword;
    }

    return this.finishUpdate(
      userId,
      departmentId,
      dto,
      tenantId,
      organizationId,
      branchId,
      parentId,
      data,
    );
  }

  async accessDepartment(
    userId: string,
    sessionId: string,
    departmentId: string,
    dto: AccessDepartmentDto,
    request: Pick<AuthenticatedRequest, 'ip' | 'headers'>,
  ) {
    const tenantId = await this.getTenantIdForUser(userId);
    const department = await this.database.client.department.findFirst({
      where: {
        id: departmentId,
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        code: true,
        type: true,
        category: true,
        requiresDepartmentPassword: true,
        departmentPasswordHash: true,
      },
    });

    const staffProfile = await this.database.client.staffProfile.findFirst({
      where: {
        userId,
        tenantId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        user: {
          select: {
            identities: {
              where: {
                type: 'EMAIL',
                status: 'ACTIVE',
                verifiedAt: { not: null },
                credentialHash: { not: null },
              },
              select: { id: true },
              take: 1,
            },
          },
        },
        assignments: {
          where: {
            departmentId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            role: true,
            accessLevel: true,
            branchId: true,
          },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
      },
    });

    const requestMetadata = {
      ipAddress: request.ip ?? null,
      userAgent:
        typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent'].slice(0, 1000)
          : null,
    };

    if (!department || !staffProfile?.assignments.length || !staffProfile.user.identities.length) {
      await this.database.client.departmentAccessAttempt.create({
        data: {
          userId,
          staffProfileId: staffProfile?.id ?? null,
          departmentId: department?.id ?? null,
          status: 'UNAUTHORIZED',
          ...requestMetadata,
        },
      });
      throw new ForbiddenException('You are not assigned to this department');
    }

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentFailures = await this.database.client.departmentAccessAttempt.count({
      where: {
        userId,
        departmentId,
        status: 'FAILED_PASSWORD',
        createdAt: { gte: fifteenMinutesAgo },
      },
    });

    if (recentFailures >= 5) {
      await this.database.client.departmentAccessAttempt.create({
        data: {
          userId,
          staffProfileId: staffProfile.id,
          departmentId,
          status: 'LOCKED',
          ...requestMetadata,
        },
      });
      throw new HttpException(
        'Department access is temporarily locked after repeated incorrect passwords',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (department.requiresDepartmentPassword) {
      const valid =
        Boolean(department.departmentPasswordHash) &&
        Boolean(dto.password) &&
        (await this.passwordService.verify(department.departmentPasswordHash!, dto.password!));
      if (!valid) {
        await this.database.client.departmentAccessAttempt.create({
          data: {
            userId,
            staffProfileId: staffProfile.id,
            departmentId,
            status: 'FAILED_PASSWORD',
            ...requestMetadata,
          },
        });
        throw new UnauthorizedException('Incorrect department password');
      }
    }

    const assignment = staffProfile.assignments[0];
    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this department');
    }
    await this.database.client.departmentAccessAttempt.create({
      data: {
        userId,
        staffProfileId: staffProfile.id,
        departmentId,
        status: 'SUCCESS',
        ...requestMetadata,
      },
    });

    const departmentAccessToken = await this.jwtService.signAsync(
      {
        sub: userId,
        sid: sessionId,
        tenantId,
        departmentId,
        assignmentId: assignment.id,
        branchId: assignment.branchId,
        type: 'department_access',
      },
      {
        issuer: this.config.getOrThrow<string>('authentication.jwt.issuer'),
        audience: this.config.getOrThrow<string>('authentication.jwt.audience'),
        expiresIn: '15m',
      },
    );

    return {
      departmentAccessToken,
      expiresInSeconds: 900,
      department: {
        id: department.id,
        name: department.name,
        code: department.code,
        type: department.type,
        category: department.category,
      },
      assignment: {
        role: assignment.role,
        accessLevel: assignment.accessLevel,
        branchId: assignment.branchId,
      },
    };
  }

  async getDepartmentWorkspace(
    userId: string,
    sessionId: string,
    departmentId: string,
    departmentAccessToken: string | undefined,
  ) {
    if (!departmentAccessToken) {
      throw new UnauthorizedException('Department access is required');
    }

    let payload: {
      sub?: string;
      sid?: string;
      tenantId?: string;
      departmentId?: string;
      assignmentId?: string;
      branchId?: string | null;
      type?: string;
    };
    try {
      payload = await this.jwtService.verifyAsync(departmentAccessToken, {
        issuer: this.config.getOrThrow<string>('authentication.jwt.issuer'),
        audience: this.config.getOrThrow<string>('authentication.jwt.audience'),
      });
    } catch {
      throw new UnauthorizedException(
        'Department access has expired; enter the department password again',
      );
    }

    if (
      payload.type !== 'department_access' ||
      payload.sub !== userId ||
      payload.sid !== sessionId ||
      payload.departmentId !== departmentId ||
      !payload.assignmentId ||
      !payload.tenantId
    ) {
      throw new UnauthorizedException('Invalid department access');
    }

    const session = await this.sessionService.findActiveSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new UnauthorizedException('Your login session is no longer active');
    }

    const staffProfile = await this.database.client.staffProfile.findFirst({
      where: {
        userId,
        tenantId: payload.tenantId,
        status: 'ACTIVE',
        assignments: {
          some: {
            id: payload.assignmentId,
            departmentId,
            status: 'ACTIVE',
          },
        },
        tenant: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        assignments: {
          where: { id: payload.assignmentId, departmentId, status: 'ACTIVE' },
          select: { role: true, accessLevel: true, branchId: true },
          take: 1,
        },
      },
    });
    const department = await this.database.client.department.findFirst({
      where: {
        id: departmentId,
        tenantId: payload.tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        category: true,
        dashboardConfig: true,
        sidebarConfig: true,
        workflowConfig: true,
      },
    });

    if (
      !staffProfile ||
      !department ||
      staffProfile.assignments[0]?.branchId !== payload.branchId
    ) {
      throw new ForbiddenException('Department assignment is no longer active');
    }

    const [staffCount, serviceCount, queueCount, waitingQueueCount, appointmentCount] =
      await Promise.all([
        this.database.client.staffDepartmentAssignment.count({
          where: {
            departmentId,
            status: 'ACTIVE',
            staffProfile: { status: 'ACTIVE' },
          },
        }),
        this.database.client.service.count({
          where: {
            tenantId: payload.tenantId,
            departmentId,
            status: 'ACTIVE',
            deletedAt: null,
          },
        }),
        this.database.client.queue.count({
          where: {
            tenantId: payload.tenantId,
            departmentId,
            status: 'ACTIVE',
          },
        }),
        this.database.client.queueEntry.count({
          where: {
            tenantId: payload.tenantId,
            status: 'WAITING',
            queue: { departmentId },
          },
        }),
        this.database.client.appointment.count({
          where: {
            tenantId: payload.tenantId,
            departmentId,
          },
        }),
      ]);

    return {
      department,
      staff: {
        firstName: staffProfile.firstName,
        lastName: staffProfile.lastName,
        role: staffProfile.assignments[0]?.role ?? 'Staff',
        accessLevel: staffProfile.assignments[0]?.accessLevel ?? 'VIEW',
        branchId: staffProfile.assignments[0]?.branchId ?? null,
      },
      metrics: {
        assignedStaff: staffCount,
        activeServices: serviceCount,
        activeQueues: queueCount,
        waitingQueueEntries: waitingQueueCount,
        appointments: appointmentCount,
      },
    };
  }

  private async finishUpdate(
    userId: string,
    departmentId: string,
    dto: UpdateDepartmentDto,
    tenantId: string,
    organizationId: string | null,
    branchId: string | null,
    parentId: string | null,
    data: any,
  ) {
    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    if (dto.organizationId !== undefined) {
      data.organizationId = dto.organizationId;
    }

    if (dto.branchId !== undefined) {
      data.branchId = dto.branchId;
    }

    if (dto.parentId !== undefined) {
      data.parentId = dto.parentId;
    }

    await this.validateReferences(tenantId, organizationId, branchId, parentId, departmentId);

    if (Object.keys(data).length === 0) {
      return this.getById(userId, departmentId);
    }

    return this.database.client.$transaction(async (tx) => {
      const department = await tx.department.update({
        where: {
          id: departmentId,
        },
        data,
        select: {
          id: true,
          name: true,
          code: true,
          type: true,
          category: true,
          description: true,
          status: true,
          organizationId: true,
          branchId: true,
          parentId: true,
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          parent: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.queue.updateMany({
        where: {
          tenantId,
          departmentId: department.id,
          code: `D-${department.id}`,
        },
        data: {
          name: `${department.name} Queue`,
          branchId: department.branchId,
          description: `Automatically managed queue for ${department.name}.`,
        },
      });

      return department;
    });
  }

  async remove(userId: string, departmentId: string) {
    const tenantId = await this.getTenantIdForUser(userId);

    const department = await this.database.client.department.findFirst({
      where: {
        id: departmentId,
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const [childCount, serviceCount, memberCount] = await Promise.all([
      this.database.client.department.count({
        where: {
          tenantId,
          parentId: departmentId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      this.database.client.service.count({
        where: {
          tenantId,
          departmentId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      this.database.client.membership.count({
        where: {
          tenantId,
          departmentId,
          status: 'ACTIVE',
        },
      }),
    ]);

    if (childCount > 0 || serviceCount > 0 || memberCount > 0) {
      throw new ConflictException(
        'Department cannot be deactivated while it has active child departments, services, or members',
      );
    }

    return this.database.client.department.update({
      where: {
        id: department.id,
      },
      data: {
        status: 'INACTIVE',
        deletedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        deletedAt: true,
      },
    });
  }

  private normalizeDepartmentType(value?: string | null): any {
    if (!value) {
      return 'OPD';
    }

    const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');

    const allowed = [
      'EMERGENCY_TRAUMA',
      'ICU',
      'HDU',
      'NICU',
      'PICU',
      'OPD',
      'INPATIENT_WARD',
      'INTERNAL_MEDICINE',
      'SURGERY_OT',
      'OBGYN',
      'PAEDIATRICS',
      'CARDIOLOGY',
      'ONCOLOGY',
      'NEUROLOGY',
      'ORTHOPAEDICS',
      'PSYCHIATRY',
      'DENTAL',
      'OPHTHALMOLOGY',
      'ENT',
      'DERMATOLOGY',
      'RADIOLOGY',
      'LABORATORY',
      'BLOOD_BANK',
      'PHARMACY',
      'PHYSIOTHERAPY',
      'NUTRITION',
      'ANAESTHESIA',
      'CSSD',
      'MEDICAL_RECORDS',
      'BILLING_FINANCE',
      'HR',
      'PROCUREMENT_STORES',
      'BIOMEDICAL',
      'HOUSEKEEPING_INFECTION_CONTROL',
      'AMBULANCE_TRANSPORT',
      'CUSTOM',
    ];

    return allowed.includes(normalized) ? normalized : 'OPD';
  }

  private normalizeDepartmentCategory(value?: string | null): any {
    if (!value) {
      return 'CLINICAL';
    }

    const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');

    const allowed = [
      'CLINICAL',
      'CRITICAL_CARE',
      'DIAGNOSTICS',
      'CLINICAL_SUPPORT',
      'SURGICAL',
      'ADMINISTRATIVE',
      'SUPPORT',
    ];

    return allowed.includes(normalized) ? normalized : 'CLINICAL';
  }

  private generateDepartmentBlueprint(
    type: string,
    category: string,
    requiresDepartmentPassword: boolean,
  ) {
    const baselinePages = [
      'Department Overview',
      'Live Queue',
      'Patient Worklist',
      'Appointments & Calendar',
      'Encounters / Notes',
      'Orders',
      'Results & Documents',
      'Tasks & Handover',
      'Staff & Shifts',
      'Inventory & Supplies',
      'Billing / Charge Capture',
      'Reports & Analytics',
      'Notifications',
      'Audit & Access Logs',
    ];

    const moduleMap: Record<string, string[]> = {
      ICU: ['Beds', 'Rooms', 'Equipment'],
      HDU: ['Beds', 'Rooms'],
      NICU: ['Beds', 'Rooms', 'Equipment'],
      PICU: ['Beds', 'Rooms', 'Equipment'],
      EMERGENCY_TRAUMA: ['Live Queue', 'Ambulance Dispatch', 'Beds'],
      SURGERY_OT: ['Theatres', 'Equipment'],
      RADIOLOGY: ['Radiology', 'Results & Documents'],
      LABORATORY: ['Laboratory', 'Results & Documents'],
      PHARMACY: ['Shop', 'Inventory & Supplies'],
      AMBULANCE_TRANSPORT: ['Vehicles', 'Ambulance Dispatch'],
      BILLING_FINANCE: ['Billing / Charge Capture', 'Reports & Analytics'],
      PROCUREMENT_STORES: ['Inventory & Supplies', 'Shop'],
      HOUSEKEEPING_INFECTION_CONTROL: ['Inventory & Supplies', 'Audit & Access Logs'],
    };

    const enabledPages = [...baselinePages, ...(moduleMap[type] ?? [])];

    const widgets = [
      {
        type: 'summary-kpis',
        title: 'Operational KPIs',
        emphasis: 'real-time',
      },
      {
        type: 'live-capacity',
        title: 'Live Capacity',
        emphasis: 'alerting',
      },
      {
        type: 'queue-priority',
        title: 'Priority Queue',
        emphasis: 'ai-assisted',
      },
      {
        type: 'staff-coverage',
        title: 'Staff Coverage',
        emphasis: 'roster',
      },
    ];

    const defaultRoles = [
      {
        name: 'Department Administrator',
        scope: 'DEPARTMENT',
        permissions: [
          'department.read',
          'department.update',
          'staff.manage',
          'queue.manage',
          'inventory.manage',
        ],
      },
      {
        name: 'Clinical Lead',
        scope: 'DEPARTMENT',
        permissions: ['queue.manage', 'encounters.write', 'orders.manage', 'reports.read'],
      },
      {
        name: 'Supervisor',
        scope: 'DEPARTMENT',
        permissions: ['queue.read', 'staff.read', 'tasks.manage', 'audit.read'],
      },
    ];

    return {
      autoGeneratedFeatures: {
        type,
        category,
        enabledPages,
        modules: [...new Set(enabledPages)],
        createdBy: 'revaltrix-automation',
      },
      dashboardConfig: {
        layout: 'command-center',
        widgets,
        refreshIntervalSeconds: 15,
        alertsEnabled: true,
        predictiveAlerts: true,
        liveCapacityTracking: true,
      },
      sidebarConfig: {
        groups: [
          {
            label: 'Operations',
            items: enabledPages.slice(0, 8),
          },
          {
            label: 'Clinical',
            items: enabledPages.slice(8, 12),
          },
          {
            label: 'Admin',
            items: enabledPages.slice(12),
          },
        ],
        departmentType: type,
      },
      workflowConfig: {
        name: `${type} departmental workflow`,
        stages: ['Intake', 'Assessment', 'Treatment / Service', 'Review', 'Discharge / Handover'],
        automations: [
          'queue-priority-rebalancing',
          'handover-escalation',
          'alert-when-capacity-nears-limit',
        ],
      },
      settings: {
        departmentType: type,
        category,
        defaultRoles,
        operationalRules: {
          requiresDepartmentPassword,
          liveQueueEnabled: true,
          auditTrailRequired: true,
          aiPrioritizationEnabled: ['ICU', 'EMERGENCY_TRAUMA', 'SURGERY_OT'].includes(type),
        },
      },
    };
  }

  private toSlug(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }

  private async getTenantIdForUser(userId: string): Promise<string> {
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
        tenantId: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!membership) {
      throw new NotFoundException('Active tenant membership not found');
    }

    return membership.tenantId;
  }

  private async ensureUniqueCode(tenantId: string, code: string): Promise<void> {
    const existing = await this.database.client.department.findFirst({
      where: {
        tenantId,
        code,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException('A department with this code already exists');
    }
  }

  private async validateReferences(
    tenantId: string,
    organizationId?: string | null,
    branchId?: string | null,
    parentId?: string | null,
    currentDepartmentId?: string,
  ): Promise<void> {
    if (organizationId) {
      const organization = await this.database.client.organization.findFirst({
        where: {
          id: organizationId,
          tenantId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!organization) {
        throw new NotFoundException('Organization not found in the current tenant');
      }
    }

    if (branchId) {
      const branch = await this.database.client.branch.findFirst({
        where: {
          id: branchId,
          tenantId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
          organizationId: true,
        },
      });

      if (!branch) {
        throw new NotFoundException('Branch not found in the current tenant');
      }

      if (organizationId && branch.organizationId && branch.organizationId !== organizationId) {
        throw new BadRequestException('Branch does not belong to the selected organization');
      }
    }

    if (parentId) {
      if (currentDepartmentId && parentId === currentDepartmentId) {
        throw new BadRequestException('A department cannot be its own parent');
      }

      const parent = await this.database.client.department.findFirst({
        where: {
          id: parentId,
          tenantId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
          organizationId: true,
          branchId: true,
        },
      });

      if (!parent) {
        throw new NotFoundException('Parent department not found in the current tenant');
      }

      if (organizationId && parent.organizationId && parent.organizationId !== organizationId) {
        throw new BadRequestException(
          'Parent department does not belong to the selected organization',
        );
      }

      if (branchId && parent.branchId && parent.branchId !== branchId) {
        throw new BadRequestException('Parent department does not belong to the selected branch');
      }
    }
  }
}
