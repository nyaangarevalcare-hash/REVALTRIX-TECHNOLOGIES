import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../core/authentication/guards/access-token.guard.js';
import type { AuthenticatedRequest } from '../core/authentication/guards/access-token.guard.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { ServicesService } from './services.service.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../authorization/guards/permission.guard.js';

@Controller('v1/services')
@UseGuards(AccessTokenGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('services', 'read')
  async list(@Req() request: AuthenticatedRequest) {
    return this.servicesService.list(
      request.auth.userId,
      request.departmentAccess?.departmentId,
      request.departmentAccess?.branchId,
    );
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('services', 'create')
  async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(request.auth.userId, dto);
  }

  @Patch(':serviceId')
  @UseGuards(PermissionGuard)
  @RequirePermission('services', 'update')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(request.auth.userId, serviceId, dto);
  }

  @Delete(':serviceId')
  @UseGuards(PermissionGuard)
  @RequirePermission('services', 'delete')
  async remove(@Req() request: AuthenticatedRequest, @Param('serviceId') serviceId: string) {
    return this.servicesService.remove(request.auth.userId, serviceId);
  }
}
