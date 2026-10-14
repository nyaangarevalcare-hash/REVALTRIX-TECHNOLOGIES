import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../core/authentication/guards/access-token.guard.js';
import type { AuthenticatedRequest } from '../core/authentication/guards/access-token.guard.js';
import { PermissionGuard } from '../authorization/guards/permission.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { AssignStaffDepartmentDto } from './dto/assign-staff-department.dto.js';
import { CreateStaffShiftDto } from './dto/create-staff-shift.dto.js';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto.js';
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

  @Post(':staffProfileId/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'update')
  approveStaff(
    @Req() request: AuthenticatedRequest,
    @Param('staffProfileId') staffProfileId: string,
  ) {
    return this.staffService.approveStaff(request.auth.userId, staffProfileId);
  }

  @Get(':staffProfileId/access-history')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'read')
  getAccessHistory(
    @Req() request: AuthenticatedRequest,
    @Param('staffProfileId') staffProfileId: string,
  ) {
    return this.staffService.getAccessHistory(request.auth.userId, staffProfileId);
  }

  @Post(':staffProfileId/assignments')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'update')
  assignDepartment(
    @Req() request: AuthenticatedRequest,
    @Param('staffProfileId') staffProfileId: string,
    @Body() dto: AssignStaffDepartmentDto,
  ) {
    return this.staffService.assignDepartment(request.auth.userId, staffProfileId, dto);
  }

  @Post(':staffProfileId/shifts')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'update')
  createShift(
    @Req() request: AuthenticatedRequest,
    @Param('staffProfileId') staffProfileId: string,
    @Body() dto: CreateStaffShiftDto,
  ) {
    return this.staffService.createShift(request.auth.userId, staffProfileId, dto);
  }

  @Patch(':staffProfileId/status')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'update')
  updateStatus(
    @Req() request: AuthenticatedRequest,
    @Param('staffProfileId') staffProfileId: string,
    @Body() dto: UpdateStaffStatusDto,
  ) {
    return this.staffService.updateStatus(request.auth.userId, staffProfileId, dto.status);
  }

  @Post(':staffProfileId/reset-password')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'update')
  sendPasswordReset(
    @Req() request: AuthenticatedRequest,
    @Param('staffProfileId') staffProfileId: string,
  ) {
    return this.staffService.sendPasswordReset(request.auth.userId, staffProfileId);
  }
}
