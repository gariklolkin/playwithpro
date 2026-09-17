import { DisputeOutcome, PaymentStatus, SessionStatus } from '@prisma/client';
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

  const heldPayment = {
    id: 'payment-1',
    providerRef: 'mock-hold-session-1',
    status: PaymentStatus.HELD,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.payment.findFirst.mockResolvedValue(heldPayment);
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
  });

  const sessionInState = (
    status: SessionStatus,
    outcome: DisputeOutcome | null = null,
  ) => {
    prisma.session.findUnique.mockResolvedValue({
      status,
      playerId: 'player-1',
      serviceType: 'CONSULTATION',
      priceMinor: 4005,
      currency: 'EUR',
      proProfile: { userId: 'coach-1' },
      dispute: outcome === null ? null : { outcome },
    });
  };

  it('releases the held payment of a completed session', async () => {
    sessionInState(SessionStatus.COMPLETED_PAID);

    await service.settle('session-1');

    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: PaymentStatus.HELD },
      data: { status: PaymentStatus.RELEASED },
    });
    expect(payments.release).toHaveBeenCalledWith('mock-hold-session-1');
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

  it.each([
    [DisputeOutcome.RELEASE, PaymentStatus.RELEASED],
    [DisputeOutcome.REFUND, PaymentStatus.REFUNDED],
  ])(
    'settles a resolved dispute by its outcome (%s)',
    async (outcome, target) => {
      sessionInState(SessionStatus.RESOLVED, outcome);

      await service.settle('session-1');

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: PaymentStatus.HELD },
        data: { status: target },
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
      data: { status: PaymentStatus.HELD },
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
