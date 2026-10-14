import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../core/authentication/authentication.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { EncountersModule } from '../encounters/encounters.module.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, EncountersModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
