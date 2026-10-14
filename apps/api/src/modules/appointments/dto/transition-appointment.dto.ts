import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TransitionAppointmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  staffNotes?: string;
}
