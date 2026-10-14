import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { StaffEmploymentType, StaffProfessionalCategory } from '@prisma/client';

export class UpdateStaffDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) middleName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @MinLength(7) @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(50) whatsappNumber?: string;
  @IsOptional() @IsIn(['FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY', 'OTHER']) gender?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(150) nationalId?: string;
  @IsOptional() @IsString() @MaxLength(100) nationality?: string;
  @IsOptional() @IsString() @MaxLength(1000) physicalAddress?: string;
  @IsOptional() @IsString() @MaxLength(150) jobTitle?: string;
  @IsOptional() @IsEnum(StaffEmploymentType) employmentType?: StaffEmploymentType;
  @IsOptional() @IsUUID() reportsToId?: string;
  @IsOptional() @IsEnum(StaffProfessionalCategory) professionalCategory?: StaffProfessionalCategory;
  @IsOptional() @IsString() @MaxLength(150) licenseNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) specialty?: string;
  @IsOptional() @IsString() @MaxLength(200) subSpecialty?: string;
  @IsOptional() @IsString() @MaxLength(200) licensingBody?: string;
  @IsOptional() @IsDateString() licenseExpiresAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) qualifications?: string;
  @IsOptional() @IsInt() @Min(0) @Max(80) yearsExperience?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) consultationFee?: number;
  @IsOptional() @IsBoolean() telehealthEnabled?: boolean;
  @IsOptional() @IsBoolean() acceptsOnlineBookings?: boolean;
  @IsOptional() @IsBoolean() acceptsNewPatients?: boolean;
  @IsOptional() @IsString() @MaxLength(4000) professionalBio?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @IsUrl({}, { each: true }) @MaxLength(500, { each: true }) professionalLinks?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID(undefined, { each: true }) serviceIds?: string[];
}