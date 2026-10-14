import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DepartmentAccessLevel, StaffStatus } from '@prisma/client';
import type { AuthenticatedRequest } from '../core/authentication/guards/access-token.guard.js';
import { DatabaseService } from '../../database/database.service.js';
import { SessionService } from '../core/sessions/session.service.js';
import type { RequiredPermission } from './types/authorization.types.js';
import { AuthorizationService } from './authorization.service.js';

interface DepartmentAccessPayload {
  sub?: string;
  sid?: string;
  tenantId?: string;
  departmentId?: string;
  assignmentId?: string;
  branchId?: string | null;
  type?: string;
}

export interface DepartmentPermissionContext {
  tenantId: string;
  departmentId: string;
  branchId: string | null;
  accessLevel: DepartmentAccessLevel;
  role: string;
  canGrantPermission: boolean;
}

const ACCESS_RANK: Record<DepartmentAccessLevel, number> = {
  VIEW: 0,
  OPERATE: 1,
  MANAGE: 2,
  ADMIN: 3,
};

@Injectable()
export class DepartmentPermissionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly sessionService: SessionService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async authorize(
    request: AuthenticatedRequest,
    required: RequiredPermission,
  ): Promise<DepartmentPermissionContext | null> {
    const tokenHeader = request.headers['x-department-access-token'];
    if (tokenHeader === undefined) {
      return null;
    }
    if (typeof tokenHeader !== 'string' || !tokenHeader.trim()) {
      throw new UnauthorizedException('Invalid department access token');
    }

    let payload: DepartmentAccessPayload;
    try {
      payload = await this.jwtService.verifyAsync<DepartmentAccessPayload>(tokenHeader.trim(), {
        issuer: this.config.getOrThrow<string>('authentication.jwt.issuer'),
        audience: this.config.getOrThrow<string>('authentication.jwt.audience'),
      });
    } catch {
      throw new UnauthorizedException('Department access has expired; enter the password again');
    }

    if (
      payload.type !== 'department_access' ||
      payload.sub !== request.auth.userId ||
      payload.sid !== request.auth.sessionId ||
      !payload.departmentId ||
      !payload.assignmentId ||
      !payload.tenantId
    ) {
      throw new UnauthorizedException('Invalid department access');
    }

    const session = await this.sessionService.findActiveSession(request.auth.sessionId);
    if (!session || session.userId !== request.auth.userId) {
      throw new UnauthorizedException('Your login session is no longer active');
    }

    const profile = await this.database.client.staffProfile.findFirst({
      where: {
        userId: request.auth.userId,
        tenantId: payload.tenantId,
        status: StaffStatus.ACTIVE,
        tenant: { status: 'ACTIVE', deletedAt: null },
        assignments: {
          some: {
            id: payload.assignmentId,
            departmentId: payload.departmentId,
            status: 'ACTIVE',
            department: { status: 'ACTIVE', deletedAt: null },
          },
        },
      },
      select: {
        id: true,
        assignments: {
          where: {
            id: payload.assignmentId,
            departmentId: payload.departmentId,
            status: 'ACTIVE',
          },
          select: { accessLevel: true, role: true, branchId: true },
          take: 1,
        },
      },
    });
    const assignment = profile?.assignments[0];
    if (!profile || !assignment) {
      throw new ForbiddenException('Department assignment is no longer active');
    }

    const context: DepartmentPermissionContext = {
      tenantId: payload.tenantId,
      departmentId: payload.departmentId,
      branchId: assignment.branchId,
      accessLevel: assignment.accessLevel,
      role: assignment.role,
      canGrantPermission: this.canGrant(required, assignment.accessLevel, assignment.role),
    };
    if (payload.branchId !== assignment.branchId) {
      throw new UnauthorizedException(
        'Department access scope has changed; enter the password again',
      );
    }
    request.departmentAccess = context;

    const minimum = this.minimumLevel(required);
    if (minimum === null) {
      throw new ForbiddenException('Department access is not enabled for this operation');
    }
    if (!this.roleAllows(required, assignment.role)) {
      throw new ForbiddenException('Your department role does not permit this operation');
    }
    if (ACCESS_RANK[assignment.accessLevel] < ACCESS_RANK[minimum]) {
      throw new ForbiddenException('Your department access level does not permit this operation');
    }
    await this.authorizationService.assertFeatureAvailable(
      request.auth.userId,
      required.resource,
      context.tenantId,
    );
    await this.assertRequestScope(request, required.resource, context);
    return context;
  }

  private canGrant(
    required: RequiredPermission,
    accessLevel: DepartmentAccessLevel,
    role: string,
  ): boolean {
    const minimum = this.minimumLevel(required);
    if (minimum === null) {
      return false;
    }
    return this.roleAllows(required, role) && ACCESS_RANK[accessLevel] >= ACCESS_RANK[minimum];
  }

  private roleAllows(required: RequiredPermission, role: string): boolean {
    const normalizedRole = role.trim().toLowerCase();
    if (!normalizedRole) {
      return false;
    }
    if (required.resource === 'appointments' || required.resource === 'queues') {
      return true;
    }
    if (required.resource === 'encounters' || required.resource === 'clinical_notes') {
      return /doctor|physician|nurs|clinician|clinical|provider|therap|midwi|dentist|pharmacist|radiolog/.test(
        normalizedRole,
      );
    }
    if (required.resource === 'services') {
      return (
        required.action === 'read' ||
        /admin|manager|supervisor|director|head|lead|service coordinator/.test(normalizedRole)
      );
    }
    return false;
  }

  private minimumLevel(required: RequiredPermission): DepartmentAccessLevel | null {
    const { resource, action } = required;
    if (
      !['appointments', 'queues', 'encounters', 'services', 'clinical_notes'].includes(resource)
    ) {
      return null;
    }
    if (action === 'read') {
      return DepartmentAccessLevel.VIEW;
    }
    if (resource === 'clinical_notes') {
      if (action === 'create' || action === 'update') {
        return DepartmentAccessLevel.OPERATE;
      }
      if (action === 'sign' || action === 'finalize') {
        return DepartmentAccessLevel.MANAGE;
      }
      return DepartmentAccessLevel.ADMIN;
    }
    if (resource === 'services') {
      return action === 'create' || action === 'update' || action === 'delete'
        ? DepartmentAccessLevel.MANAGE
        : DepartmentAccessLevel.ADMIN;
    }
    if (action === 'create' || action === 'update') {
      return DepartmentAccessLevel.OPERATE;
    }
    if (action === 'delete') {
      return DepartmentAccessLevel.MANAGE;
    }
    return DepartmentAccessLevel.ADMIN;
  }

  private async assertRequestScope(
    request: AuthenticatedRequest,
    resource: string,
    context: DepartmentPermissionContext,
  ): Promise<void> {
    const body = this.toRecord(request.body);
    const query = this.toRecord(request.query);
    const directDepartmentId =
      this.readString(body, 'departmentId') ?? this.readString(query, 'departmentId');
    if (directDepartmentId && directDepartmentId !== context.departmentId) {
      throw new ForbiddenException('This department session cannot access another department');
    }
    const directBranchId = this.readString(body, 'branchId') ?? this.readString(query, 'branchId');
    if (context.branchId && directBranchId && directBranchId !== context.branchId) {
      throw new ForbiddenException('This department session cannot access another branch');
    }

    const entityScope = await this.findEntityScope(
      request,
      resource,
      context.tenantId,
      body,
      query,
    );
    if (entityScope !== null) {
      if (
        entityScope.departmentId !== context.departmentId ||
        (context.branchId && entityScope.branchId !== context.branchId)
      ) {
        throw new ForbiddenException('This department session cannot access another department');
      }
      return;
    }

    if (request.path.includes('/reconcile/')) {
      throw new ForbiddenException('This operation is not scoped to the active department');
    }

    if (request.method === 'GET') {
      const params = new URLSearchParams(request.url.split('?')[1] ?? '');
      params.set('departmentId', context.departmentId);
      if (context.branchId) {
        params.set('branchId', context.branchId);
      }
      request.url = `${request.path}?${params.toString()}`;
      return;
    }
    if (!body) {
      throw new ForbiddenException('Department scope could not be verified');
    }
    body.departmentId = context.departmentId;
    if (context.branchId) {
      body.branchId = context.branchId;
    }
  }

  private async findEntityScope(
    request: AuthenticatedRequest,
    resource: string,
    tenantId: string,
    body: Record<string, unknown> | undefined,
    query: Record<string, unknown> | undefined,
  ): Promise<{ departmentId: string | null; branchId: string | null } | null> {
    const params = request.params as Record<string, string | undefined>;
    const routeKeys: Record<string, string[]> = {
      appointments: ['appointmentId'],
      queues: ['queueId', 'entryId', 'careRecordId', 'attachmentId'],
      encounters: ['encounterId'],
      clinical_notes: ['clinicalNoteId', 'encounterId'],
      services: ['serviceId'],
    };
    for (const key of routeKeys[resource] ?? []) {
      const id = params[key] ?? this.readString(body, key) ?? this.readString(query, key);
      if (id) {
        const scope = await this.lookupEntityScope(resource, key, id, tenantId);
        if (!scope || !scope.departmentId) {
          throw new ForbiddenException('The requested resource is not assigned to a department');
        }
        return scope;
      }
    }
    return null;
  }

  private async lookupEntityScope(
    resource: string,
    key: string,
    id: string,
    tenantId: string,
  ): Promise<{ departmentId: string | null; branchId: string | null } | null> {
    if (resource === 'appointments') {
      const record = await this.database.client.appointment.findFirst({
        where: { id, tenantId },
        select: { departmentId: true, branchId: true },
      });
      return record ? { departmentId: record.departmentId, branchId: record.branchId } : null;
    }
    if (resource === 'encounters' || (resource === 'clinical_notes' && key === 'encounterId')) {
      const record = await this.database.client.encounter.findFirst({
        where: { id, tenantId },
        select: { departmentId: true, branchId: true },
      });
      return record ? { departmentId: record.departmentId, branchId: record.branchId } : null;
    }
    if (resource === 'clinical_notes') {
      const record = await this.database.client.clinicalNote.findFirst({
        where: { id, tenantId },
        select: {
          encounter: { select: { departmentId: true, branchId: true } },
        },
      });
      return record
        ? {
            departmentId: record.encounter.departmentId,
            branchId: record.encounter.branchId,
          }
        : null;
    }
    if (resource === 'services') {
      const record = await this.database.client.service.findFirst({
        where: { id, tenantId },
        select: { departmentId: true, branchId: true },
      });
      return record ? { departmentId: record.departmentId, branchId: record.branchId } : null;
    }
    if (key === 'queueId') {
      const record = await this.database.client.queue.findFirst({
        where: { id, tenantId },
        select: { departmentId: true, branchId: true },
      });
      return record ? { departmentId: record.departmentId, branchId: record.branchId } : null;
    }
    if (key === 'entryId') {
      const record = await this.database.client.queueEntry.findFirst({
        where: { id, tenantId },
        select: { queue: { select: { departmentId: true, branchId: true } } },
      });
      return record
        ? {
            departmentId: record.queue.departmentId,
            branchId: record.queue.branchId,
          }
        : null;
    }
    if (key === 'careRecordId') {
      const record = await this.database.client.queueCareRecord.findFirst({
        where: { id, tenantId },
        select: {
          departmentId: true,
          queueEntry: {
            select: { queue: { select: { departmentId: true, branchId: true } } },
          },
        },
      });
      return record
        ? {
            departmentId: record.departmentId ?? record.queueEntry.queue.departmentId,
            branchId: record.queueEntry.queue.branchId,
          }
        : null;
    }
    if (key === 'attachmentId') {
      const record = await this.database.client.queueCareAttachment.findFirst({
        where: { id, tenantId },
        select: {
          careRecord: {
            select: {
              departmentId: true,
              queueEntry: {
                select: { queue: { select: { departmentId: true, branchId: true } } },
              },
            },
          },
        },
      });
      return record
        ? {
            departmentId:
              record.careRecord.departmentId ?? record.careRecord.queueEntry.queue.departmentId,
            branchId: record.careRecord.queueEntry.queue.branchId,
          }
        : null;
    }
    return null;
  }

  private readString(record: Record<string, unknown> | undefined, key: string): string | null {
    const value = record?.[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private toRecord(value: unknown): Record<string, unknown> | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }
}
