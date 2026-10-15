import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { EmailConfig } from './email.config.js';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class EmailService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;

  constructor(private readonly config: EmailConfig) {
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      requireTLS: !this.config.secure,
      auth: {
        user: this.config.username,
        pass: this.config.password,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: {
          name: this.config.fromName,
          address: this.config.fromEmail,
        },
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
    } catch (error) {
      const details: Record<string, string | number> = {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      };
      if (typeof error === 'object' && error !== null) {
        if ('code' in error && typeof error.code === 'string') details.code = error.code;
        if ('command' in error && typeof error.command === 'string') {
          details.command = error.command;
        }
        if ('responseCode' in error && typeof error.responseCode === 'number') {
          details.responseCode = error.responseCode;
        }
      }
      this.logger.error(`Email delivery failed: ${JSON.stringify(details)}`);
      throw error;
    }
  }

  async verifyConnection(): Promise<void> {
    await this.transporter.verify();
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter.close();
  }
}
