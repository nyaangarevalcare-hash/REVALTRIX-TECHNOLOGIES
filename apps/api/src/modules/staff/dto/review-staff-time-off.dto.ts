import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewStaffTimeOffDto {
  @IsIn(['APPROVED', 'REJECTED', 'CANCELLED'])
  status!: 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNotes?: string;
}