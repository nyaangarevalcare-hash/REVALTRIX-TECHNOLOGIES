import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service.js';

@Injectable()
export class VerificationEmailService {
  constructor(
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async sendRegistrationVerification(email: string, code: string, expiresAt: Date): Promise<void> {
    const expiresInMinutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));

    await this.emailService.send({
      to: email,
      subject: `${code} is your Revaltrix verification code`,
      text: [
        'Revaltrix',
        '',
        'Email verification',
        '',
        `Your verification code is ${code}.`,
        '',
        `This code expires in ${expiresInMinutes} minutes.`,
        '',
        'Enter this code in the Revaltrix registration page to verify your email address.',
        '',
        'If you did not create a Revaltrix account, no action is required.',
        '',
        'Revaltrix',
      ].join('\n'),
      html: `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Revaltrix verification code</title>
          </head>

          <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#202124;">
            <div style="width:100%;padding:32px 0;">
              <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px;box-sizing:border-box;">

                <div style="font-size:22px;font-weight:700;margin-bottom:28px;">
                  Revaltrix
                </div>

                <h1 style="font-size:24px;line-height:1.3;margin:0 0 16px;">
                  Email verification
                </h1>

                <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">
                  Use the verification code below to verify your email address.
                </p>

                <div style="margin:24px 0;padding:20px;text-align:center;background:#f4f6f8;border:1px solid #e5e7eb;border-radius:6px;">
                  <div style="font-size:32px;line-height:1.2;font-weight:700;letter-spacing:8px;">
                    ${code}
                  </div>
                </div>

                <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
                  This code expires in
                  <strong>${expiresInMinutes} minutes</strong>.
                </p>

                <p style="font-size:14px;line-height:1.6;margin:0 0 24px;">
                  Enter the code in the Revaltrix registration page to continue.
                </p>

                <p style="font-size:13px;line-height:1.6;color:#5f6368;margin:0;">
                  If you did not create a Revaltrix account, no action is required.
                </p>

                <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:13px;color:#5f6368;">
                  Revaltrix
                </div>

              </div>
            </div>
          </body>
        </html>
      `,
    });
  }

  async sendStaffVerification(
    email: string,
    code: string,
    registrationToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const webAppUrl = this.config.getOrThrow<string>('app.webAppUrl').replace(/\/+$/, '');
    const verificationUrl =
      `${webAppUrl}/register/tenant/dashboard` +
      `#registration_token=${encodeURIComponent(registrationToken)}`;
    const expiresInMinutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));

    await this.emailService.send({
      to: email,
      subject: 'Verify your Revaltrix staff account',
      text: [
        'A Revaltrix organization invited you to its staff workspace.',
        '',
        `Your email verification code is ${code}.`,
        `The code expires in ${expiresInMinutes} minutes.`,
        '',
        `Open the secure verification page: ${verificationUrl}`,
        '',
        'After verification, Revaltrix will email you a separate link to create your password.',
        'If you did not expect this invitation, contact your organization administrator.',
      ].join('\n'),
      html: `
        <!doctype html>
        <html lang="en">
          <body style="font-family:Arial,Helvetica,sans-serif;color:#202124">
            <h1>Verify your Revaltrix staff account</h1>
            <p>A Revaltrix organization invited you to its staff workspace.</p>
            <p>Your email verification code is:</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
            <p>This code expires in ${expiresInMinutes} minutes.</p>
            <p><a href="${verificationUrl}">Open the secure verification page</a></p>
            <p>After verification, we will email you a separate link to create your password.</p>
            <p>If you did not expect this invitation, contact your organization administrator.</p>
          </body>
        </html>
      `,
    });
  }

  async sendFamilyAccessStepUp(email: string, code: string, expiresAt: Date): Promise<void> {
    const expiresInMinutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));
    await this.emailService.send({
      to: email,
      subject: `${code} is your Revaltrix security code`,
      text: [
        'Revaltrix security check',
        '',
        `Your one-time security code is ${code}.`,
        `It expires in ${expiresInMinutes} minutes and can be used once.`,
        'Use this code only for an action you initiated in your Revaltrix account.',
        'If you did not request this code, secure your account and contact support.',
      ].join('\n'),
      html: `
        <!doctype html>
        <html lang="en">
          <body style="font-family:Arial,Helvetica,sans-serif;color:#202124">
            <h1>Revaltrix security check</h1>
            <p>Your one-time security code is:</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
            <p>This code expires in ${expiresInMinutes} minutes and can be used once.</p>
            <p>If you did not request this code, secure your account and contact support.</p>
          </body>
        </html>
      `,
    });
  }

  async sendPatientOnboarding(
    email: string,
    registrationToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const webAppUrl = this.config.getOrThrow<string>('app.webAppUrl').replace(/\/+$/, '');

    const onboardingUrl =
      `${webAppUrl}/register/patient/onboarding` +
      `#registration_token=${encodeURIComponent(registrationToken)}`;

    const expiresInMinutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));

    await this.emailService.send({
      to: email,
      subject: 'Your Revaltrix account is ready for onboarding',
      text: [
        'Revaltrix',
        '',
        'Continue your patient account setup',
        '',
        'Your identity has been verified. Continue your Revaltrix onboarding to create your password and complete your patient profile.',
        '',
        `Continue onboarding: ${onboardingUrl}`,
        '',
        `This secure onboarding link expires in ${expiresInMinutes} minutes.`,
        '',
        'If you did not expect this message, you can safely ignore it.',
        '',
        'Revaltrix',
      ].join('\n'),
      html: `
        <!doctype html>
        <html lang="en">
          <body>
            <p><strong>Revaltrix</strong></p>

            <h2>Continue your patient account setup</h2>

            <p>
              Your identity has been verified. Continue your Revaltrix
              onboarding to create your password and complete your patient
              profile.
            </p>

            <p>
              <a
                href="${onboardingUrl}"
                style="display:inline-block;padding:12px 20px;text-decoration:none;border-radius:6px;background:#111827;color:#ffffff;"
              >
                Continue onboarding
              </a>
            </p>

            <p>
              This secure onboarding link expires in
              ${expiresInMinutes} minutes.
            </p>

            <p>
              If you did not expect this message, you can safely ignore it.
            </p>

            <p>Revaltrix</p>
          </body>
        </html>
      `,
    });
  }

  async sendStaffPasswordSetup(
    email: string,
    registrationToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const webAppUrl = this.config.getOrThrow<string>('app.webAppUrl').replace(/\/+$/, '');
    const setupUrl =
      `${webAppUrl}/register/tenant/dashboard` +
      `#registration_token=${encodeURIComponent(registrationToken)}`;
    const expiresInMinutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));

    await this.emailService.send({
      to: email,
      subject: 'Set up your Revaltrix staff account',
      text: [
        'Your email address has been verified.',
        '',
        'Use this secure link to create your password and activate your staff account:',
        setupUrl,
        '',
        `This link expires in ${expiresInMinutes} minutes.`,
        'If you did not expect this invitation, contact your organization administrator.',
      ].join('\n'),
      html: `
        <!doctype html>
        <html lang="en">
          <body style="font-family:Arial,Helvetica,sans-serif;color:#202124">
            <h1>Your staff account is verified</h1>
            <p>Create a password to activate your Revaltrix staff account.</p>
            <p>
              <a href="${setupUrl}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#111827;color:#ffffff;text-decoration:none;">
                Set up your password
              </a>
            </p>
            <p>This secure link expires in ${expiresInMinutes} minutes.</p>
            <p>If you did not expect this invitation, contact your organization administrator.</p>
          </body>
        </html>
      `,
    });
  }
}
