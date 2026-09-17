import {
  CancellationTier,
  DisputeOutcome,
  PaymentStatus,
  SessionStatus,
} from '@prisma/client';
import type { PaymentProvider } from '../payments/payment-provider';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettlementService } from './settlement.service';

describe('SettlementService', () => {
  const prisma = {
    session: { findUnique: jest.fn() },
    payment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const payments = { release: jest.fn(), refund: jest.fn() };
  const analytics = { track: jest.fn() };
  const notifications = { enqueue: jest.fn() };
  const service = new SettlementService(
    prisma as unknown as PrismaService,
    payments as unknown as PaymentProvider,
    analytics,
    notifications as unknown as NotificationsService,
  );

  const readAt = new Date('2026-09-20T10:00:00Z');
  const heldPayment = {
    id: 'payment-1',
    providerRef: 'mock-hold-session-1',
    status: PaymentStatus.HELD,
    updatedAt: readAt,
  };
  /** The claim: still held AND unchanged since it was read (see the waiver). */
  const claimWhere = {
    id: 'payment-1',
    status: PaymentStatus.HELD,
    updatedAt: readAt,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.payment.findFirst.mockResolvedValue(heldPayment);
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
  });

  const sessionInState = (
    status: SessionStatus,
    outcome: DisputeOutcome | null = null,
    cancellation: Partial<{
      startsAt: Date;
      cancellationTier: CancellationTier | null;
      cancellationRefundMinor: number | null;
      feeWaivedAt: Date | null;
    }> = {},
  ) => {
    prisma.session.findUnique.mockResolvedValue({
      status,
      playerId: 'player-1',
      serviceType: 'CONSULTATION',
      priceMinor: 4005,
      currency: 'EUR',
      startsAt: new Date(Date.now() - 60_000),
      cancellationTier: null,
      cancellationRefundMinor: null,
      feeWaivedAt: null,
      proProfile: { userId: 'coach-1' },
      dispute: outcome === null ? null : { outcome },
      ...cancellation,
    });
  };

  it('releases the held payment of a completed session', async () => {
    sessionInState(SessionStatus.COMPLETED_PAID);

    await service.settle('session-1');

    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: claimWhere,
      data: { status: PaymentStatus.RELEASED, refundedMinor: null },
    });
    expect(payments.release).toHaveBeenCalledWith(
      'mock-hold-session-1',
      undefined,
    );
    expect(payments.refund).not.toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith({
      event: 'session_completed',
      distinctId: 'player-1',
      properties: {
        sessionId: 'session-1',
        serviceType: 'consultation',
        amountMinor: 4005,
        currency: 'EUR',
        sessionStatus: 'completed_paid',
        refundedMinor: 0,
      },
    });
    // Completion emails follow the money, after the exactly-once movement.
    expect(notifications.enqueue).toHaveBeenCalledWith(prisma, [
      {
        kind: 'SESSION_COMPLETED_PLAYER',
        sessionId: 'session-1',
        recipientId: 'player-1',
      },
      {
        kind: 'SESSION_COMPLETED_COACH',
        sessionId: 'session-1',
        recipientId: 'coach-1',
      },
    ]);
  });

  it('emits no money event when the provider fails', async () => {
    sessionInState(SessionStatus.COMPLETED_PAID);
    payments.release.mockRejectedValueOnce(new Error('provider down'));

    await service.settle('session-1');

    expect(analytics.track).not.toHaveBeenCalled();
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('refunds the held payment of a cancelled session', async () => {
    sessionInState(SessionStatus.CANCELLED);

    await service.settle('session-1');

    expect(payments.refund).toHaveBeenCalledWith('mock-hold-session-1');
    expect(payments.release).not.toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'session_refunded',
        distinctId: 'player-1',
      }),
    );
  });

  describe('late cancellations', () => {
    const late = (overrides: Parameters<typeof sessionInState>[2] = {}) =>
      sessionInState(SessionStatus.CANCELLED, null, {
        cancellationTier: CancellationTier.PARTIAL,
        cancellationRefundMinor: 2003,
        ...overrides,
      });

    it('refunds a free-tier cancellation right away', async () => {
      late({
        cancellationTier: CancellationTier.FREE,
        cancellationRefundMinor: 4005,
        startsAt: new Date(Date.now() + 3_600_000),
      });

      await service.settle('session-1');

      expect(payments.refund).toHaveBeenCalledWith('mock-hold-session-1');
    });

    it('owes nothing before the original start time (the waiver window)', async () => {
      late({ startsAt: new Date(Date.now() + 3_600_000) });

      await service.settle('session-1');

      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(payments.release).not.toHaveBeenCalled();
      expect(payments.refund).not.toHaveBeenCalled();
    });

    it('settles at the start with one release carrying the refunded part', async () => {
      late();

      await service.settle('session-1');

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: claimWhere,
        data: { status: PaymentStatus.RELEASED, refundedMinor: 2003 },
      });
      expect(payments.release).toHaveBeenCalledWith('mock-hold-session-1', {
        refundMinor: 2003,
      });
      expect(payments.refund).not.toHaveBeenCalled();
      // Not a completed session, and no completion emails.
      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'cancellation_settled',
          properties: expect.objectContaining({
            refundedMinor: 2003,
          }) as object,
        }),
      );
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('releases everything in the no-refund tier', async () => {
      late({
        cancellationTier: CancellationTier.NONE,
        cancellationRefundMinor: 0,
      });

      await service.settle('session-1');

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: claimWhere,
        data: { status: PaymentStatus.RELEASED, refundedMinor: null },
      });
      expect(payments.release).toHaveBeenCalledWith(
        'mock-hold-session-1',
        undefined,
      );
    });

    it('refunds in full once the fee was waived — even before the start', async () => {
      late({
        feeWaivedAt: new Date(),
        cancellationRefundMinor: 4005,
        startsAt: new Date(Date.now() + 3_600_000),
      });

      await service.settle('session-1');

      expect(payments.refund).toHaveBeenCalledWith('mock-hold-session-1');
      expect(payments.release).not.toHaveBeenCalled();
    });

    it('loses its claim to a waiver that touched the payment row meanwhile', async () => {
      late();
      // The waiver's transaction bumped updatedAt after this settle read it.
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });

      await service.settle('session-1');

      expect(payments.release).not.toHaveBeenCalled();
      expect(payments.refund).not.toHaveBeenCalled();
    });

    it('reverts the refunded part with the claim when the provider fails', async () => {
      late();
      payments.release.mockRejectedValueOnce(new Error('provider down'));

      await service.settle('session-1');

      expect(prisma.payment.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'payment-1', status: PaymentStatus.RELEASED },
        data: { status: PaymentStatus.HELD, refundedMinor: null },
      });
    });
  });

  it.each([
    [DisputeOutcome.RELEASE, PaymentStatus.RELEASED],
    [DisputeOutcome.REFUND, PaymentStatus.REFUNDED],
  ])(
    'settles a resolved dispute by its outcome (%s)',
    async (outcome, target) => {
      sessionInState(SessionStatus.RESOLVED, outcome);

      await service.settle('session-1');

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: claimWhere,
        data: { status: target, refundedMinor: null },
      });
    },
  );

  it('moves nothing for sessions that owe nothing', async () => {
    for (const status of [
      SessionStatus.PAID_ESCROW,
      SessionStatus.IN_PROGRESS,
      SessionStatus.AWAITING_CONFIRMATION,
      SessionStatus.DISPUTED,
    ]) {
      sessionInState(status);
      await service.settle('session-1');
    }

    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(payments.release).not.toHaveBeenCalled();
    expect(payments.refund).not.toHaveBeenCalled();
  });

  it('never double-moves when another settler already claimed', async () => {
    sessionInState(SessionStatus.COMPLETED_PAID);
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });

    await service.settle('session-1');

    expect(payments.release).not.toHaveBeenCalled();
    expect(payments.refund).not.toHaveBeenCalled();
  });

  it('reverts the claim when the provider fails, so the sweep retries', async () => {
    sessionInState(SessionStatus.COMPLETED_PAID);
    payments.release.mockRejectedValue(new Error('provider down'));

    await service.settle('session-1');

    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'payment-1', status: PaymentStatus.RELEASED },
      data: { status: PaymentStatus.HELD, refundedMinor: null },
    });
  });

  it('skips payments without a provider reference', async () => {
    sessionInState(SessionStatus.COMPLETED_PAID);
    prisma.payment.findFirst.mockResolvedValue({
      ...heldPayment,
      providerRef: null,
    });

    await service.settle('session-1');

    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('sweep re-settles every owed payment', async () => {
    prisma.payment.findMany.mockResolvedValue([
      { sessionId: 'session-1' },
      { sessionId: 'session-2' },
    ]);
    sessionInState(SessionStatus.COMPLETED_PAID);

    await service.sweep();

    expect(prisma.session.findUnique).toHaveBeenCalledTimes(2);
    expect(payments.release).toHaveBeenCalledTimes(2);
  });

  it('sweep swallows a failed scan so a bootstrap kickoff cannot reject', async () => {
    // A deadlock against a concurrent TRUNCATE (e2e) or a DB blip (prod).
    prisma.payment.findMany.mockRejectedValue(new Error('deadlock detected'));

    await expect(service.sweep()).resolves.toBeUndefined();
    expect(() => service.onApplicationBootstrap()).not.toThrow();
    expect(payments.release).not.toHaveBeenCalled();
  });
});
