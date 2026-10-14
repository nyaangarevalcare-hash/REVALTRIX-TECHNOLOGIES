import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../core/authentication/authentication.module.js';
import { AuthorizationService } from './authorization.service.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { PlatformPermissionGuard } from './guards/platform-permission.guard.js';
import { TenantFeatureSettingsService } from './tenant-feature-settings.service.js';

@Module({
  imports: [AuthenticationModule],
  providers: [
    AuthorizationService,
    PermissionGuard,
    PlatformPermissionGuard,
    TenantFeatureSettingsService,
  ],
  exports: [
    AuthorizationService,
    PermissionGuard,
    PlatformPermissionGuard,
    TenantFeatureSettingsService,
  ],
})
export class AuthorizationModule {}
