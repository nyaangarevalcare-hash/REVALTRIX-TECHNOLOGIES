import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type EmailProvider = 'resend' | 'smtp';

@Injectable()
export class EmailConfig {
  constructor(private readonly config: ConfigService) {}

  private optional(name: string): string | undefined {
    const value = this.config.get<string>(name)?.trim();
    return value || undefined;
  }

  get apiKey(): string | undefined {
    return this.optional('RESEND_API_KEY');
  }

  get fromEmail(): string | undefined {
    return this.optional('RESEND_FROM_EMAIL');
  }

  get fromName(): string {
    return this.optional('SMTP_FROM_NAME') ?? 'Revaltrix';
  }

  get smtpUsername(): string | undefined {
    return this.optional('SMTP_USERNAME');
  }

  get smtpPassword(): string | undefined {
    return this.optional('SMTP_PASSWORD');
  }

  get smtpHost(): string {
    return this.optional('SMTP_HOST') ?? 'smtp.gmail.com';
  }

  get smtpPort(): number {
    const raw = this.optional('SMTP_PORT');
    const port = raw ? Number(raw) : 465;

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT must be a valid port number');
    }

    return port;
  }

  get smtpFromEmail(): string | undefined {
    return this.optional('SMTP_FROM_EMAIL') ?? this.smtpUsername;
  }

  get hasResend(): boolean {
    return Boolean(this.apiKey && this.fromEmail);
  }

  get hasSmtp(): boolean {
    return Boolean(this.smtpUsername && this.smtpPassword && this.smtpFromEmail);
  }

  get provider(): EmailProvider {
    const preferred = this.optional('EMAIL_PROVIDER')?.toLowerCase();

    if (preferred && preferred !== 'resend' && preferred !== 'smtp') {
      throw new Error('EMAIL_PROVIDER must be resend or smtp');
    }

    if (preferred === 'resend' && this.hasResend) return 'resend';
    if (preferred === 'smtp' && this.hasSmtp) return 'smtp';

    if (preferred) {
      throw new Error(
        `EMAIL_PROVIDER is ${preferred}, but its credentials are incomplete`,
      );
    }

    if (this.hasResend) return 'resend';
    if (this.hasSmtp) return 'smtp';

    throw new Error(
      'Configure Resend credentials or SMTP_USERNAME and SMTP_PASSWORD',
    );
  }
}
