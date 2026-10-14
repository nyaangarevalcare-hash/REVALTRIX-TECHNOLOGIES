import { DepartmentAccessLevel } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AssignStaffDepartmentDto {
  @IsUUID()
  departmentId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  role!: string;

  @IsEnum(DepartmentAccessLevel)
  accessLevel!: DepartmentAccessLevel;

  @IsOptional()
  @IsBoolean()
  isPrimaryDepartment?: boolean;

  @IsOptional()
  @IsBoolean()
  canAccessDashboard?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
