import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AccessDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password?: string;
}
