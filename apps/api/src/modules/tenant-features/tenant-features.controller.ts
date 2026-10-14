import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TenantFeature } from '@prisma/client';
import { AccessTokenGuard } from '../core/authentication/guards/access-token.guard.js';
import type { AuthenticatedRequest } from '../core/authentication/guards/access-token.guard.js';
import { PlatformPermissionGuard } from '../authorization/guards/platform-permission.guard.js';
import { RequirePlatformPermission } from '../authorization/decorators/require-platform-permission.decorator.js';
import { TenantFeaturesService } from './tenant-features.service.js';
import { UpdateTenantFeatureDto } from './dto/update-tenant-feature.dto.js';

@Controller('v1/tenant-features')
@UseGuards(AccessTokenGuard)
export class TenantFeaturesController {
  constructor(private readonly tenantFeatures: TenantFeaturesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.tenantFeatures.listForUser(request.auth.userId);
  }

  @Get('management-access')
  canManage(@Req() request: AuthenticatedRequest) {
    return this.tenantFeatures.canManage(request.auth.userId);
  }

  @Patch(':tenantId/:feature')
  @UseGuards(PlatformPermissionGuard)
  @RequirePlatformPermission('tenant_features', 'update')
  update(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('feature', new ParseEnumPipe(TenantFeature)) feature: TenantFeature,
    @Body() body: UpdateTenantFeatureDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.tenantFeatures.setForTenant({
      tenantId,
      feature,
      enabled: body.enabled,
      actorUserId: request.auth.userId,
    });
  }
}
