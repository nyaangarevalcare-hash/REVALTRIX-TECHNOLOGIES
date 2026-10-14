import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePatientAppointmentDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsUUID()
  serviceId!: string;

  @IsDateString({ strict: true })
  startAt!: string;

  @IsDateString({ strict: true })
  endAt!: string;

  @IsString()
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
