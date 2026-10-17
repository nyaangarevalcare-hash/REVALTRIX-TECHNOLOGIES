import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  departmentPassword?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresDepartmentPassword?: boolean | null;

  @IsOptional()
  @IsUUID()
  organizationId?: string | null;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  headOfDepartment?: string | null;

  @IsOptional()
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  extensionNumber?: string | null;

  @IsOptional()
  @IsBoolean()
  appointmentBookingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  walkInRegistrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  queueManagementEnabled?: boolean;
}
