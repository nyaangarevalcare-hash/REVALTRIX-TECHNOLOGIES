import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../core/authentication/authentication.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { TenantFeaturesController } from './tenant-features.controller.js';
import { TenantFeaturesService } from './tenant-features.service.js';

@Module({
  imports: [AuthenticationModule, AuthorizationModule],
  controllers: [TenantFeaturesController],
  providers: [TenantFeaturesService],
  exports: [TenantFeaturesService],
})
export class TenantFeaturesModule {}
