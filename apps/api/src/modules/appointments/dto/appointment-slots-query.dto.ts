import {
  IsDateString,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class AppointmentSlotsQueryDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  serviceId!: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsDateString({ strict: true })
  from!: string;

  @IsDateString({ strict: true })
  to!: string;
}
