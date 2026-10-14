import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DepartmentAccessLevel,
  StaffEmploymentType,
  StaffProfessionalCategory,
} from '@prisma/client';
import { AssignStaffDepartmentDto } from './assign-staff-department.dto.js';

export class CreateStaffDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  staffNumber?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  whatsappNumber?: string;

  @IsOptional()
  @IsIn(['FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY', 'OTHER'])
  gender?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  physicalAddress?: string;

  @IsUUID()
  departmentId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  role!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsEnum(DepartmentAccessLevel)
  accessLevel?: DepartmentAccessLevel;

  @IsOptional()
  @IsBoolean()
  canAccessDashboard?: boolean;

  @IsOptional()
  @IsDateString()
  assignmentStartsAt?: string;

  @IsOptional()
  @IsDateString()
  assignmentEndsAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AssignStaffDepartmentDto)
  additionalAssignments?: AssignStaffDepartmentDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  serviceIds!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  jobTitle!: string;

  @IsOptional()
  @IsEnum(StaffEmploymentType)
  employmentType?: StaffEmploymentType;

  @IsOptional()
  @IsUUID()
  reportsToId?: string;

  @IsOptional()
  @IsDateString()
  joinedAt?: string;

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

  @IsEnum(StaffProfessionalCategory)
  professionalCategory!: StaffProfessionalCategory;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subSpecialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  licensingBody?: string;

  @IsOptional()
  @IsDateString()
  licenseExpiresAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  yearsExperience?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  languages!: string[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  consultationFee?: number;

  @IsOptional()
  @IsBoolean()
  telehealthEnabled?: boolean;

  @IsBoolean()
  acceptsOnlineBookings!: boolean;

  @IsOptional()
  @IsBoolean()
  acceptsNewPatients?: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  professionalBio!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsUrl({}, { each: true })
  @MaxLength(500, { each: true })
  professionalLinks?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsIn(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], { each: true })
  shiftDays!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  shiftName!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  shiftStartTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  shiftEndTime!: string;
}
