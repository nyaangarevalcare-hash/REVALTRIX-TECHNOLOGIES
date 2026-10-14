import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DepartmentAccessLevel } from '@prisma/client';

export class CreateStaffDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsUUID()
  departmentId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  role!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(DepartmentAccessLevel)
  accessLevel?: DepartmentAccessLevel;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobTitle?: string;
}
