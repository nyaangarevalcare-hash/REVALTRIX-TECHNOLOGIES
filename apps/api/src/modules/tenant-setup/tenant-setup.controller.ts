import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../core/authentication/guards/access-token.guard.js';
import type { AuthenticatedRequest } from '../core/authentication/guards/access-token.guard.js';
import { PermissionGuard } from '../authorization/guards/permission.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { TenantSetupService } from './tenant-setup.service.js';

@Controller('v1/tenant-setup')
@UseGuards(AccessTokenGuard)
export class TenantSetupController {
  constructor(private readonly tenantSetupService: TenantSetupService) {}

  @Get()
  async getSetup(@Req() request: AuthenticatedRequest) {
    return this.tenantSetupService.getSetup(request.auth.userId);
  }

  @Post('activation/validate')
  async validateActivation(@Req() request: AuthenticatedRequest) {
    return this.tenantSetupService.getSetup(request.auth.userId);
  }

  @Post('activation/request')
  @UseGuards(PermissionGuard)
  @RequirePermission('organization', 'update')
  async requestActivation(@Req() request: AuthenticatedRequest) {
    return this.tenantSetupService.requestActivation(request.auth.userId);
  }
}
