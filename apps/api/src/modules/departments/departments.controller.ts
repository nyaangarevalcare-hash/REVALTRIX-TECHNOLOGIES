import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { DepartmentsService } from './departments.service.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../authorization/guards/permission.guard.js';
import { CreateDepartmentDto } from './dto/create-department.dto.js';
import { UpdateDepartmentDto } from './dto/update-department.dto.js';
import { AccessTokenGuard } from '../core/authentication/guards/access-token.guard.js';
import type { AuthenticatedRequest } from '../core/authentication/guards/access-token.guard.js';
import { AccessDepartmentDto } from './dto/access-department.dto.js';

@Controller('v1/departments')
@UseGuards(AccessTokenGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'read')
  async list(@Req() request: AuthenticatedRequest) {
    return this.departmentsService.list(request.auth.userId);
  }

  @Post(':departmentId/access')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async accessDepartment(
    @Req() request: AuthenticatedRequest,
    @Param('departmentId') departmentId: string,
    @Body() dto: AccessDepartmentDto,
  ) {
    return this.departmentsService.accessDepartment(
      request.auth.userId,
      request.auth.sessionId,
      departmentId,
      dto,
      request,
    );
  }

  @Get(':departmentId/workspace')
  async getDepartmentWorkspace(
    @Req() request: AuthenticatedRequest,
    @Param('departmentId') departmentId: string,
    @Headers('x-department-access-token') departmentAccessToken?: string,
  ) {
    return this.departmentsService.getDepartmentWorkspace(
      request.auth.userId,
      request.auth.sessionId,
      departmentId,
      departmentAccessToken,
    );
  }

  @Get(':departmentId')
  async getById(@Req() request: AuthenticatedRequest, @Param('departmentId') departmentId: string) {
    return this.departmentsService.getById(request.auth.userId, departmentId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'create')
  async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(request.auth.userId, dto);
  }

  @Patch(':departmentId')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'update')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('departmentId') departmentId: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.update(request.auth.userId, departmentId, dto);
  }

  @Delete(':departmentId')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments', 'delete')
  async remove(@Req() request: AuthenticatedRequest, @Param('departmentId') departmentId: string) {
    return this.departmentsService.remove(request.auth.userId, departmentId);
  }
}
