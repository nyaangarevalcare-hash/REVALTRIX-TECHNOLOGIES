import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID()
  patientTenantRecordId!: string;

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
  @IsUUID()
  serviceId?: string;

  @IsDateString({ strict: true })
  startAt!: string;

  @IsDateString({ strict: true })
  endAt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timeZone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  patientNotes?: string;
}
