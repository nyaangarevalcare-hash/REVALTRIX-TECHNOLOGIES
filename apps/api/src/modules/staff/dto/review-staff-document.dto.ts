import { StaffDocumentStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewStaffDocumentDto {
  @IsIn([StaffDocumentStatus.VERIFIED, StaffDocumentStatus.REJECTED])
  status!: 'VERIFIED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNotes?: string;
}