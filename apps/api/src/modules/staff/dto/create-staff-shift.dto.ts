import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { StaffShiftStatus } from '@prisma/client';

export class CreateStaffShiftDto {
  @IsUUID()
  departmentId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  shiftName!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], { each: true })
  daysOfWeek!: string[];

  @IsOptional()
  @IsEnum(StaffShiftStatus)
  status?: StaffShiftStatus;
}
