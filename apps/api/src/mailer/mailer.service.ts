import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.transporter = createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT'),
      secure: false,
    });
    this.from = config.get<string>('SMTP_FROM') ?? 'no-reply@playwithpro.local';
  }

  async sendVerificationEmail(to: string, link: string): Promise<void> {
    await this.send(
      to,
      'Verify your PlayWithPro email',
      [
        'Welcome to PlayWithPro! 🏓',
        '',
        'Confirm your email address by opening the link below (valid for 1 hour):',
        link,
        '',
        "If you didn't create an account, you can ignore this email.",
      ].join('\n'),
    );
  }

  async sendPasswordResetEmail(to: string, link: string): Promise<void> {
    await this.send(
      to,
      'Reset your PlayWithPro password',
      [
        'We received a request to reset your PlayWithPro password.',
        '',
        'Set a new password by opening the link below (valid for 1 hour):',
        link,
        '',
        "If you didn't request this, you can ignore this email — your password stays unchanged.",
      ].join('\n'),
    );
  }

  async sendVerificationApprovedEmail(
    to: string,
    displayName: string,
  ): Promise<void> {
    await this.send(
      to,
      "You're verified on PlayWithPro 🎉",
      [
        `Hi ${displayName},`,
        '',
        'Your professional profile has been verified. Amateurs can now find and book you once availability opens.',
        '',
        'See you at the table!',
      ].join('\n'),
    );
  }

  async sendVerificationRejectedEmail(
    to: string,
    displayName: string,
    note: string,
  ): Promise<void> {
    await this.send(
      to,
      'Update on your PlayWithPro verification',
      [
        `Hi ${displayName},`,
        '',
        'We could not verify your professional profile this time.',
        '',
        `Reviewer note: ${note}`,
        '',
        'You can update your profile and submit again at any moment.',
      ].join('\n'),
    );
  }

  /** Sends best-effort: a broken SMTP must not fail auth flows. */
  private async send(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
    } catch (error) {
      this.logger.error(`Failed to send "${subject}" to ${to}`, error as Error);
    }
  }
}
