import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

export class AppointmentQueryDto {
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsUUID()
  patientTenantRecordId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
