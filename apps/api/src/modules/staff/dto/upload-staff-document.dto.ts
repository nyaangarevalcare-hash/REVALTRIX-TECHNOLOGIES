import { StaffDocumentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class UploadStaffDocumentDto {
  @IsEnum(StaffDocumentType)
  type!: StaffDocumentType;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}