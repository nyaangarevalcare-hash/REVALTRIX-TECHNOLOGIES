import { StaffStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateStaffStatusDto {
  @IsEnum(StaffStatus)
  status!: StaffStatus;
}
