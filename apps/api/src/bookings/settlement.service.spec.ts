import { DisputeOutcome, PaymentStatus, SessionStatus } from '@prisma/client';
import type { PaymentProvider } from '../payments/payment-provider';
import { PrismaService } from '../prisma/prisma.service';
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
  const service = new SettlementService(
    prisma as unknown as PrismaService,
    payments as unknown as PaymentProvider,
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
  });

  it('refunds the held payment of a cancelled session', async () => {
    sessionInState(SessionStatus.CANCELLED);

    await service.settle('session-1');

    expect(payments.refund).toHaveBeenCalledWith('mock-hold-session-1');
    expect(payments.release).not.toHaveBeenCalled();
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
});
