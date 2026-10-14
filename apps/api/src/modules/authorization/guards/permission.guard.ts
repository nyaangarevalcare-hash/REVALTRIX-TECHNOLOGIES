import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../core/authentication/guards/access-token.guard.js';
import { AuthorizationService } from '../authorization.service.js';
import { REQUIRED_PERMISSION_KEY } from '../decorators/require-permission.decorator.js';
import type { RequiredPermission } from '../types/authorization.types.js';
import { DepartmentPermissionService } from '../department-permission.service.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
    private readonly departmentPermissionService: DepartmentPermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      throw new ForbiddenException('Authorization permission is not configured for this endpoint');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth?.userId) {
      throw new ForbiddenException('Authenticated user context is required');
    }

    const departmentAccess = await this.departmentPermissionService.authorize(request, required);
    try {
      await this.authorizationService.assertPermission(request.auth.userId, required);
    } catch (error) {
      if (error instanceof ForbiddenException && departmentAccess?.canGrantPermission) {
        if (
          !(await this.authorizationService.hasExplicitDeny(
            request.auth.userId,
            required,
            departmentAccess.tenantId,
          ))
        ) {
          return true;
        }
      }
      throw error;
    }

    return true;
  }
}
