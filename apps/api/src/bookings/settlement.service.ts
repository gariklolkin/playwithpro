import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DisputeOutcome, PaymentStatus, SessionStatus } from '@prisma/client';
import type { PaymentProvider } from '../payments/payment-provider';
import { PAYMENT_PROVIDER } from '../payments/payment-provider';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Moves escrowed money exactly once per held payment. Session status is the
 * source of truth for the direction; the conditional HELD→terminal update is
 * the claim, so concurrent settlers (user action + sweep) never double-move.
 * A provider failure reverts the claim and the sweep retries — a session can
 * therefore be completed/resolved/cancelled while its payment briefly stays
 * HELD, never the other way around.
 */
@Injectable()
export class SettlementService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  onApplicationBootstrap(): void {
    void this.sweep();
  }

  /** Settles the session's held payment if its status owes a money movement. */
  async settle(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { status: true, dispute: { select: { outcome: true } } },
    });
    if (!session) {
      return;
    }
    const target = this.terminalStatusFor(session);
    if (target === null) {
      return;
    }
    const held = await this.prisma.payment.findFirst({
      where: { sessionId, status: PaymentStatus.HELD },
    });
    if (!held || held.providerRef === null) {
      return;
    }
    const claimed = await this.prisma.payment.updateMany({
      where: { id: held.id, status: PaymentStatus.HELD },
      data: { status: target },
    });
    if (claimed.count === 0) {
      return;
    }
    try {
      if (target === PaymentStatus.RELEASED) {
        await this.payments.release(held.providerRef);
      } else {
        await this.payments.refund(held.providerRef);
      }
      this.logger.log(
        `Settled payment ${held.id} for session ${sessionId} as ${target}`,
      );
    } catch (error) {
      await this.prisma.payment.updateMany({
        where: { id: held.id, status: target },
        data: { status: PaymentStatus.HELD },
      });
      this.logger.error(
        `Provider ${target === PaymentStatus.RELEASED ? 'release' : 'refund'} failed for session ${sessionId}; will retry`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Retries payments left HELD by a provider failure or a crash. */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    const owed = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.HELD,
        session: {
          status: {
            in: [
              SessionStatus.COMPLETED_PAID,
              SessionStatus.RESOLVED,
              SessionStatus.CANCELLED,
            ],
          },
        },
      },
      select: { sessionId: true },
    });
    for (const payment of owed) {
      try {
        await this.settle(payment.sessionId);
      } catch (error) {
        this.logger.error(
          `Failed to settle session ${payment.sessionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * The payment status the session's state owes: completion pays the coach,
   * a refund-resolved dispute or a paid cancellation returns the money, a
   * release-resolved dispute pays the coach. Anything else moves nothing.
   */
  private terminalStatusFor(session: {
    status: SessionStatus;
    dispute: { outcome: DisputeOutcome | null } | null;
  }): PaymentStatus | null {
    switch (session.status) {
      case SessionStatus.COMPLETED_PAID:
        return PaymentStatus.RELEASED;
      case SessionStatus.CANCELLED:
        return PaymentStatus.REFUNDED;
      case SessionStatus.RESOLVED:
        return session.dispute?.outcome === DisputeOutcome.RELEASE
          ? PaymentStatus.RELEASED
          : session.dispute?.outcome === DisputeOutcome.REFUND
            ? PaymentStatus.REFUNDED
            : null;
      default:
        return null;
    }
  }
}
