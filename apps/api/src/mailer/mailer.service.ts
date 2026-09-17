import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { EmailRenderer, type RenderedEmail } from './email-renderer';

export interface MailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface OutgoingMail extends RenderedEmail {
  attachments?: MailAttachment[];
  headers?: Record<string, string>;
}

/**
 * SMTP transport plus the direct (non-outboxed) emails: sign-in codes,
 * password resets and the verification-call flow. Everything is rendered
 * from the localized catalogs by `EmailRenderer`; session lifecycle mail
 * goes through the notifications outbox instead.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  /** Direct sends today (UTC), for the daily budget. */
  private directSent = { day: '', count: 0 };

  constructor(
    config: ConfigService,
    private readonly renderer: EmailRenderer,
  ) {
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASSWORD');
    this.transporter = createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT'),
      secure: false,
      // Real providers need auth and must never see it in plaintext;
      // dev Mailpit has neither auth nor TLS.
      ...(user && pass ? { auth: { user, pass }, requireTLS: true } : {}),
    });
    this.from = config.get<string>('SMTP_FROM') ?? 'no-reply@playwithpro.local';
  }

  /**
   * Sends and throws on failure — the outbox relies on the error to retry.
   * The recipient address never reaches the logs.
   */
  async deliver(to: string, mail: OutgoingMail): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments,
      headers: mail.headers,
    });
    this.countDirect();
  }

  /** Best-effort variant for flows that must not fail on SMTP; returns whether it was sent. */
  async send(to: string, mail: OutgoingMail): Promise<boolean> {
    try {
      await this.deliver(to, mail);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send "${mail.subject}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /** Emails sent outside the outbox today (UTC). */
  directSentToday(now = new Date()): number {
    return this.directSent.day === now.toISOString().slice(0, 10)
      ? this.directSent.count
      : 0;
  }

  private countDirect(): void {
    const day = new Date().toISOString().slice(0, 10);
    if (this.directSent.day !== day) this.directSent = { day, count: 0 };
    this.directSent.count += 1;
  }

  async sendVerificationEmail(
    to: string,
    locale: string,
    code: string,
  ): Promise<void> {
    await this.send(
      to,
      this.renderer.render(locale, 'auth.verificationCode', { code }),
    );
  }

  async sendPasswordResetEmail(
    to: string,
    locale: string,
    link: string,
  ): Promise<void> {
    await this.send(
      to,
      this.renderer.render(locale, 'auth.passwordReset', { link }),
    );
  }

  async sendVerificationApprovedEmail(
    to: string,
    locale: string,
    displayName: string,
  ): Promise<void> {
    await this.send(
      to,
      this.renderer.render(locale, 'verification.approved', {
        name: displayName,
      }),
    );
  }

  async sendVerificationRejectedEmail(
    to: string,
    locale: string,
    displayName: string,
    note: string,
  ): Promise<void> {
    await this.send(
      to,
      this.renderer.render(locale, 'verification.rejected', {
        name: displayName,
        note,
      }),
    );
  }

  private meetLine(
    locale: string,
    meetUrl: string | null,
    manageUrl: string,
  ): string {
    return meetUrl
      ? this.renderer.message(locale, 'verification.booking.meetLink', {
          url: meetUrl,
        })
      : this.renderer.message(locale, 'verification.booking.meetPending', {
          url: manageUrl,
        });
  }

  private icsAttachment(ics: string): MailAttachment[] {
    return [
      {
        filename: 'verification-call.ics',
        content: ics,
        contentType: 'text/calendar; charset=utf-8; method=REQUEST',
      },
    ];
  }

  async sendBookingConfirmedEmail(input: {
    to: string;
    locale: string;
    displayName: string;
    whenLine: string;
    meetUrl: string | null;
    manageUrl: string;
    ics: string;
  }): Promise<void> {
    await this.send(input.to, {
      ...this.renderer.render(input.locale, 'verification.booking.confirmed', {
        name: input.displayName,
        when: input.whenLine,
        meetLine: this.meetLine(input.locale, input.meetUrl, input.manageUrl),
        manageUrl: input.manageUrl,
      }),
      attachments: this.icsAttachment(input.ics),
    });
  }

  async sendBookingReminderEmail(input: {
    to: string;
    locale: string;
    displayName: string;
    whenLine: string;
    meetUrl: string | null;
    manageUrl: string;
    hoursBefore: number;
  }): Promise<void> {
    await this.send(
      input.to,
      this.renderer.render(input.locale, 'verification.booking.reminder', {
        name: input.displayName,
        when: input.whenLine,
        meetLine: this.meetLine(input.locale, input.meetUrl, input.manageUrl),
        manageUrl: input.manageUrl,
        hours: input.hoursBefore,
      }),
    );
  }

  async sendBookingRescheduledEmail(input: {
    to: string;
    locale: string;
    displayName: string;
    whenLine: string;
    meetUrl: string | null;
    manageUrl: string;
    ics: string;
  }): Promise<void> {
    await this.send(input.to, {
      ...this.renderer.render(
        input.locale,
        'verification.booking.rescheduled',
        {
          name: input.displayName,
          when: input.whenLine,
          meetLine: this.meetLine(input.locale, input.meetUrl, input.manageUrl),
          manageUrl: input.manageUrl,
        },
      ),
      attachments: this.icsAttachment(input.ics),
    });
  }

  async sendBookingCancelledByAdminEmail(input: {
    to: string;
    locale: string;
    displayName: string;
    whenLine: string;
    manageUrl: string;
  }): Promise<void> {
    await this.send(
      input.to,
      this.renderer.render(
        input.locale,
        'verification.booking.cancelledByAdmin',
        {
          name: input.displayName,
          when: input.whenLine,
          manageUrl: input.manageUrl,
        },
      ),
    );
  }

  async sendBookingNoShowEmail(input: {
    to: string;
    locale: string;
    displayName: string;
    requestCancelled: boolean;
    manageUrl: string;
  }): Promise<void> {
    await this.send(
      input.to,
      this.renderer.render(input.locale, 'verification.booking.noShow', {
        name: input.displayName,
        requestCancelled: input.requestCancelled ? 'yes' : 'no',
        manageUrl: input.manageUrl,
      }),
    );
  }

  /** Heads-up to admins when a pro cancels or withdraws. */
  async sendCoachCancelledNoticeEmail(
    admins: Array<{ email: string; locale: string }>,
    coachName: string,
    detail: string,
  ): Promise<void> {
    await Promise.all(
      admins.map((admin) =>
        this.send(
          admin.email,
          this.renderer.render(
            admin.locale,
            'verification.booking.coachCancelledNotice',
            {
              coach: coachName,
              detail,
            },
          ),
        ),
      ),
    );
  }
}
