import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailConfig {
  constructor(private readonly config: ConfigService) {}

  get apiKey(): string {
    return this.required('RESEND_API_KEY');
  }

  get fromEmail(): string {
    return this.required('RESEND_FROM_EMAIL');
  }

  get fromName(): string {
    return this.config.get<string>('SMTP_FROM_NAME', 'Revaltrix');
  }

  private required(name: string): string {
    const value = this.config.get<string>(name)?.trim();

    if (!value) {
      throw new Error(`${name} is required`);
    }

    return value;
  }
}
