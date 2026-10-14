import { IsBoolean } from 'class-validator';

export class UpdateTenantFeatureDto {
  @IsBoolean()
  enabled!: boolean;
}
