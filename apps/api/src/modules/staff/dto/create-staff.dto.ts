import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DepartmentAccessLevel, StaffEmploymentType } from '@prisma/client';

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

  @IsOptional()
  @IsEnum(StaffEmploymentType)
  employmentType?: StaffEmploymentType;

  @IsOptional()
  @IsUUID()
  reportsToId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  qualifications?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], { each: true })
  shiftDays?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shiftName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  shiftStartTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  shiftEndTime?: string;
}
