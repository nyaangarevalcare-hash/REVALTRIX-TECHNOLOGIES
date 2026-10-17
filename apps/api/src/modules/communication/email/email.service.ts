import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Resend } from 'resend';
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
  private readonly resend?: Resend;
  private readonly smtp?: Transporter;

  constructor(private readonly config: EmailConfig) {
    if (config.hasResend) {
      this.resend = new Resend(config.apiKey!);
    }

    if (config.hasSmtp) {
      this.smtp = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: {
          user: config.smtpUsername!,
          pass: config.smtpPassword!,
        },
      });
    }
  }

  async send(input: SendEmailInput): Promise<void> {
    const provider = this.config.provider;

    try {
      if (provider === 'resend') {
        if (!this.resend || !this.config.fromEmail) {
          throw new Error('Resend is not configured');
        }

        const { error } = await this.resend.emails.send({
          from: `${this.config.fromName} <${this.config.fromEmail}>`,
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
        });

        if (error) {
          throw new Error(`Resend delivery failed: ${error.message}`);
        }
      } else {
        if (!this.smtp || !this.config.smtpFromEmail) {
          throw new Error('SMTP is not configured');
        }

        await this.smtp.sendMail({
          from: `${this.config.fromName} <${this.config.smtpFromEmail}>`,
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
        });
      }
    } catch (error) {
      this.logger.error(
        `Email delivery failed using ${provider}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  async verifyConnection(): Promise<void> {
    const provider = this.config.provider;

    if (provider === 'resend') {
      if (!this.resend || !this.config.fromEmail) {
        throw new Error('Resend is not configured');
      }
      return;
    }

    if (!this.smtp) {
      throw new Error('SMTP is not configured');
    }

    await this.smtp.verify();
  }

  async onModuleDestroy(): Promise<void> {
    this.smtp?.close();
  }
}
