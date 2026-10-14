import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthenticationModule } from '../core/authentication/authentication.module.js';
import { AuthorizationService } from './authorization.service.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { PlatformPermissionGuard } from './guards/platform-permission.guard.js';
import { TenantFeatureSettingsService } from './tenant-feature-settings.service.js';
import { DepartmentPermissionService } from './department-permission.service.js';

@Module({
  imports: [AuthenticationModule, ConfigModule],
  providers: [
    AuthorizationService,
    PermissionGuard,
    PlatformPermissionGuard,
    DepartmentPermissionService,
    TenantFeatureSettingsService,
  ],
  exports: [
    AuthorizationService,
    PermissionGuard,
    PlatformPermissionGuard,
    DepartmentPermissionService,
    TenantFeatureSettingsService,
  ],
})
export class AuthorizationModule {}
