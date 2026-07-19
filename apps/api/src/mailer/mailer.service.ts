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

  async sendVerificationEmail(to: string, code: string): Promise<void> {
    await this.send(
      to,
      `${code} is your PlayWithPro confirmation code`,
      [
        'Welcome to PlayWithPro! 🏓',
        '',
        'Your confirmation code (valid for 15 minutes):',
        '',
        `    ${code}`,
        '',
        'Enter it on the screen where you signed up.',
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

  async sendBookingConfirmedEmail(input: {
    to: string;
    displayName: string;
    whenLine: string;
    meetUrl: string | null;
    manageUrl: string;
    ics: string;
  }): Promise<void> {
    await this.send(
      input.to,
      'Your PlayWithPro verification call is booked',
      [
        `Hi ${input.displayName},`,
        '',
        'Your identity video call is scheduled:',
        input.whenLine,
        '',
        ...meetLinkLines(input.meetUrl, input.manageUrl),
        '',
        `Need a different time? Reschedule here: ${input.manageUrl}`,
        '',
        'The attached invite adds the call to any calendar app.',
      ].join('\n'),
      [
        {
          filename: 'verification-call.ics',
          content: input.ics,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST',
        },
      ],
    );
  }

  async sendBookingReminderEmail(input: {
    to: string;
    displayName: string;
    whenLine: string;
    meetUrl: string | null;
    manageUrl: string;
    hoursBefore: number;
  }): Promise<void> {
    await this.send(
      input.to,
      `Reminder: PlayWithPro verification call in ${input.hoursBefore === 1 ? '1 hour' : `${input.hoursBefore} hours`}`,
      [
        `Hi ${input.displayName},`,
        '',
        'Your identity video call is coming up:',
        input.whenLine,
        '',
        ...meetLinkLines(input.meetUrl, input.manageUrl),
        '',
        `Reschedule here: ${input.manageUrl}`,
      ].join('\n'),
    );
  }

  async sendBookingRescheduledEmail(input: {
    to: string;
    displayName: string;
    whenLine: string;
    meetUrl: string | null;
    manageUrl: string;
    ics: string;
  }): Promise<void> {
    await this.send(
      input.to,
      'Your PlayWithPro verification call was rescheduled',
      [
        `Hi ${input.displayName},`,
        '',
        'Your identity video call has a new time:',
        input.whenLine,
        '',
        ...meetLinkLines(input.meetUrl, input.manageUrl),
        '',
        `Reschedule here: ${input.manageUrl}`,
      ].join('\n'),
      [
        {
          filename: 'verification-call.ics',
          content: input.ics,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST',
        },
      ],
    );
  }

  async sendBookingCancelledByAdminEmail(input: {
    to: string;
    displayName: string;
    whenLine: string;
    manageUrl: string;
  }): Promise<void> {
    await this.send(
      input.to,
      'Your PlayWithPro verification call was cancelled',
      [
        `Hi ${input.displayName},`,
        '',
        `We had to cancel your verification call scheduled for:`,
        input.whenLine,
        '',
        `Sorry about that — please pick a new time here: ${input.manageUrl}`,
      ].join('\n'),
    );
  }

  async sendBookingNoShowEmail(input: {
    to: string;
    displayName: string;
    requestCancelled: boolean;
    manageUrl: string;
  }): Promise<void> {
    await this.send(
      input.to,
      'We missed you at your PlayWithPro verification call',
      [
        `Hi ${input.displayName},`,
        '',
        'You did not join your scheduled verification call.',
        '',
        input.requestCancelled
          ? 'Because this was the second missed call, your verification request was cancelled. You can submit a new request from your profile at any time.'
          : `No problem — please pick a new time here: ${input.manageUrl}`,
      ].join('\n'),
    );
  }

  /** Heads-up to admins when a pro cancels or withdraws. */
  async sendCoachCancelledNoticeEmail(
    adminEmails: string[],
    coachName: string,
    detail: string,
  ): Promise<void> {
    await Promise.all(
      adminEmails.map((to) =>
        this.send(
          to,
          'PlayWithPro: a verification call was cancelled by the pro',
          [`${coachName}: ${detail}`].join('\n'),
        ),
      ),
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

  /** Sends best-effort: a broken SMTP must not fail application flows. */
  private async send(
    to: string,
    subject: string,
    text: string,
    attachments?: Array<{
      filename: string;
      content: string;
      contentType: string;
    }>,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        attachments,
      });
    } catch (error) {
      this.logger.error(`Failed to send "${subject}" to ${to}`, error as Error);
    }
  }
}

/** The Meet link may still be syncing right after booking. */
function meetLinkLines(meetUrl: string | null, manageUrl: string): string[] {
  return meetUrl
    ? [`Join the meeting: ${meetUrl}`]
    : [
        `The meeting link will appear on your verification page shortly: ${manageUrl}`,
      ];
}
