import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateStaffTimeOffDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}