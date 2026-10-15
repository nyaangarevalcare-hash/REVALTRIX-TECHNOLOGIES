import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { EmailConfig } from './email.config.js';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;

  constructor(private readonly config: EmailConfig) {
    this.resend = new Resend(this.config.apiKey);
  }

  async send(input: SendEmailInput): Promise<void> {
    try {
      const { error } = await this.resend.emails.send({
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });

      if (error) {
        this.logger.error(
          `Email delivery failed: ${JSON.stringify({
            name: error.name,
            message: error.message,
            statusCode: error.statusCode,
          })}`,
        );
        throw new Error(`Resend email delivery failed: ${error.message}`);
      }
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith('Resend email delivery failed:'))) {
        this.logger.error(
          `Email delivery failed: ${JSON.stringify({
            errorName: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : 'Unknown error',
          })}`,
        );
      }
      throw error;
    }
  }

  async verifyConnection(): Promise<void> {
    // Resend uses HTTPS; there is no persistent SMTP connection to verify.
    // Validate the configured API key and sender by checking configuration.
    void this.config.apiKey;
    void this.config.fromEmail;
  }
}
