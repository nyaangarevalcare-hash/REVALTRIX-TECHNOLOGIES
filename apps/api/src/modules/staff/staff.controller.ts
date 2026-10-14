import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../core/authentication/guards/access-token.guard.js';
import type { AuthenticatedRequest } from '../core/authentication/guards/access-token.guard.js';
import { PermissionGuard } from '../authorization/guards/permission.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { StaffService } from './staff.service.js';

@Controller('v1/staff')
@UseGuards(AccessTokenGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get('me')
  getMyProfile(@Req() request: AuthenticatedRequest) {
    return this.staffService.getMyProfile(request.auth.userId);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'read')
  list(@Req() request: AuthenticatedRequest) {
    return this.staffService.list(request.auth.userId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'update')
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateStaffDto) {
    return this.staffService.create(request.auth.userId, dto);
  }

  @Post(':staffProfileId/resend-invitation')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'update')
  resendInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('staffProfileId') staffProfileId: string,
  ) {
    return this.staffService.resendInvitation(request.auth.userId, staffProfileId);
  }
}
