import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../core/authentication/authentication.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { EmailModule } from '../communication/email/email.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, VerificationModule, EmailModule, StorageModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
