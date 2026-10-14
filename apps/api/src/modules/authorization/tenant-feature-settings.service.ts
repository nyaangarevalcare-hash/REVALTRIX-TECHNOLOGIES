import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';

@Injectable()
export class TenantFeatureSettingsService {
  private readonly logger = new Logger(TenantFeatureSettingsService.name);
  private availability?: Promise<boolean>;

  constructor(private readonly database: DatabaseService) {}

  isAvailable(): Promise<boolean> {
    this.availability ??= this.checkAvailability();
    return this.availability;
  }

  private async checkAvailability(): Promise<boolean> {
    const result = await this.database.client.$queryRaw<
      Array<{ tableName: string | null }>
    >`SELECT to_regclass('public.tenant_feature_settings')::text AS "tableName"`;
    const available = Boolean(result[0]?.tableName);

    if (!available) {
      this.logger.warn(
        'Tenant feature overrides are unavailable because tenant_feature_settings has not been migrated; using tenant-type defaults.',
      );
    }

    return available;
  }
}
