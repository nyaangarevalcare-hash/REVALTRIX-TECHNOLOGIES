import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { RegistrationSessionGuard } from './guards/registration-session.guard.js';
import type { RegistrationAuthenticatedRequest } from './guards/registration-session.guard.js';
import { RegistrationPasswordService } from './registration-password.service.js';
import { SetRegistrationPasswordDto } from './dto/set-registration-password.dto.js';

@Controller('v1/registration/password')
@UseGuards(RegistrationSessionGuard)
export class RegistrationPasswordController {
  constructor(private readonly registrationPasswordService: RegistrationPasswordService) {}

  @Get('status')
  getStatus(@Req() request: RegistrationAuthenticatedRequest) {
    return this.registrationPasswordService.getPasswordStatus(request.registrationAuth.userId);
  }

  @Patch()
  setPassword(
    @Req() request: RegistrationAuthenticatedRequest,
    @Body() dto: SetRegistrationPasswordDto,
  ) {
    return this.registrationPasswordService.setPassword(
      request.registrationAuth.userId,
      request.registrationAuth.registrationSessionId,
      request.registrationAuth.purpose,
      dto.password,
      dto.confirmPassword,
    );
  }

  @Patch('reset')
  resetStaffPassword(
    @Req() request: RegistrationAuthenticatedRequest,
    @Body() dto: SetRegistrationPasswordDto,
  ) {
    return this.registrationPasswordService.resetStaffPassword(
      request.registrationAuth.userId,
      request.registrationAuth.registrationSessionId,
      request.registrationAuth.purpose,
      dto.password,
      dto.confirmPassword,
    );
  }
}
