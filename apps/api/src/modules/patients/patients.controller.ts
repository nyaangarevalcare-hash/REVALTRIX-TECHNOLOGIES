import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../core/authentication/guards/access-token.guard.js';
import { AccessTokenGuard } from '../core/authentication/guards/access-token.guard.js';
import { PermissionGuard } from '../authorization/guards/permission.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { PatientsService } from './patients.service.js';
import { PatientQueryDto } from './dto/patient-query.dto.js';
import { PatientSearchDto } from './dto/patient-search.dto.js';
import { EnrollPatientDto } from './dto/enroll-patient.dto.js';
import { RegisterPatientDto } from './dto/register-patient.dto.js';
import { PatientRelationshipResponseDto } from './dto/patient-relationship-response.dto.js';
import { ExistingPatientLookupDto } from './dto/existing-patient-lookup.dto.js';

@Controller('v1/patients')
@UseGuards(AccessTokenGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('me')
  async getMyPatientProfile(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.patientsService.getMyPatientProfile(
      request.auth.userId,
    );
  }

  @Get('me/journey')
  async getMyJourney(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.patientsService.getMyJourney(
      request.auth.userId,
    );
  }

  @Get('me/care-history')
  async getMyCareHistory(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.patientsService.getMyCareHistory(
      request.auth.userId,
    );
  }

  @Get('me/care-attachments/:attachmentId/view')
  async viewMyCareAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const attachment = await this.patientsService.viewMyCareAttachment(
      request.auth.userId,
      attachmentId,
    );

    response.set({
      'Content-Type': attachment.contentType,
      'Content-Length': attachment.byteSize,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    });
    response.send(attachment.buffer);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('patients', 'read')
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: PatientQueryDto,
  ) {
    return this.patientsService.list(request.auth.userId, query);
  }

  @Get('existing')
  @UseGuards(PermissionGuard)
  @RequirePermission('patients', 'read')
  async findExisting(
    @Req() request: AuthenticatedRequest,
    @Query() query: ExistingPatientLookupDto,
  ) {
    return this.patientsService.findExistingPatient(
      request.auth.userId,
      query.identifier,
    );
  }

  @Get('search')
  @UseGuards(PermissionGuard)
  @RequirePermission('patients', 'read')
  async search(
    @Req() request: AuthenticatedRequest,
    @Query() query: PatientSearchDto,
  ) {
    return this.patientsService.search(
      request.auth.userId,
      query.query,
    );
  }

  @Post('register')
  @UseGuards(PermissionGuard)
  @RequirePermission('patients', 'create')
  async register(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RegisterPatientDto,
  ) {
    return this.patientsService.registerPatient(
      request.auth.userId,
      dto,
    );
  }

  @Post('enroll')
  @UseGuards(PermissionGuard)
  @RequirePermission('patients', 'create')
  async enroll(
    @Req() request: AuthenticatedRequest,
    @Body() dto: EnrollPatientDto,
  ) {
    return this.patientsService.enrollPatient(
      request.auth.userId,
      dto,
    );
  }

  @Post(':patientRecordId/verification/send')
  @UseGuards(AccessTokenGuard)
  async sendRegistrationVerification(
    @Req() request: AuthenticatedRequest,
    @Param('patientRecordId') patientRecordId: string,
  ) {
    return this.patientsService.sendPatientRegistrationVerification(
      request.auth.userId,
      patientRecordId,
    );
  }

  @Get('relationship-requests')
  async listRelationshipRequests(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.patientsService.listPatientRelationshipRequests(
      request.auth.userId,
    );
  }

  @Post('relationship-requests/:requestId/approve')
  async approveRelationshipRequest(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ) {
    return this.patientsService.approvePatientRelationshipRequest(
      request.auth.userId,
      requestId,
    );
  }

  @Post('relationship-requests/:requestId/decline')
  async declineRelationshipRequest(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() dto: PatientRelationshipResponseDto,
  ) {
    return this.patientsService.declinePatientRelationshipRequest(
      request.auth.userId,
      requestId,
      dto.reason,
    );
  }

  @Get(':patientRecordId')
  @UseGuards(PermissionGuard)
  @RequirePermission('patients', 'read')
  async getById(
    @Req() request: AuthenticatedRequest,
    @Param('patientRecordId') patientRecordId: string,
  ) {
    return this.patientsService.getById(
      request.auth.userId,
      patientRecordId,
    );
  }


}
