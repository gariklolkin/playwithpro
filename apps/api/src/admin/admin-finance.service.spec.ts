import { Test } from '@nestjs/testing';
import { PaymentStatus } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AdminFinanceService } from './admin-finance.service';

describe('AdminFinanceService', () => {
  let service: AdminFinanceService;

  const prisma = {
    payment: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    user: { groupBy: jest.fn(), count: jest.fn() },
    session: { groupBy: jest.fn(), findMany: jest.fn() },
    dispute: { count: jest.fn(), groupBy: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminFinanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AdminFinanceService);
  });

  it('listPayments filters by status and maps the audit fields', async () => {
    prisma.payment.count.mockResolvedValue(1);
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'p1',
        sessionId: 's1',
        provider: 'mock',
        providerRef: 'ref-1',
        amountMinor: 5000,
        currency: 'EUR',
        feeMinor: 500,
        status: 'REFUNDED',
        createdAt: new Date('2026-07-01T10:00:00Z'),
        updatedAt: new Date('2026-07-02T10:00:00Z'),
        session: {
          serviceType: 'VIDEO_ANALYSIS',
          player: { displayName: 'Player' },
          proProfile: { user: { displayName: 'Coach' } },
        },
      },
    ]);

    const result = await service.listPayments({
      status: PaymentStatus.Refunded,
      page: 1,
    });

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'REFUNDED' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result.items[0]).toMatchObject({
      id: 'p1',
      status: PaymentStatus.Refunded,
      amountMinor: 5000,
      feeMinor: 500,
      playerDisplayName: 'Player',
      coachDisplayName: 'Coach',
      serviceType: 'video_analysis',
    });
  });

  it('analytics keeps currencies separate and counts fee revenue only over released payments', async () => {
    prisma.user.groupBy.mockResolvedValue([
      { role: 'AMATEUR', _count: { _all: 10 } },
      { role: 'PROFESSIONAL', _count: { _all: 4 } },
      { role: 'ADMIN', _count: { _all: 1 } },
    ]);
    prisma.user.count.mockResolvedValue(2);
    prisma.session.groupBy.mockResolvedValue([
      { status: 'COMPLETED_PAID', _count: { _all: 7 } },
    ]);
    prisma.dispute.count.mockResolvedValue(3);
    prisma.dispute.groupBy.mockResolvedValue([
      { outcome: 'RELEASE', _count: { _all: 2 } },
      { outcome: 'REFUND', _count: { _all: 1 } },
    ]);
    prisma.payment.groupBy.mockResolvedValue([
      {
        currency: 'EUR',
        status: 'RELEASED',
        _sum: { amountMinor: 10_000, feeMinor: 1_000 },
      },
      {
        currency: 'EUR',
        status: 'HELD',
        _sum: { amountMinor: 4_000, feeMinor: 400 },
      },
      {
        currency: 'USD',
        status: 'RELEASED',
        _sum: { amountMinor: 7_000, feeMinor: 700 },
      },
      {
        currency: 'EUR',
        status: 'FAILED',
        _sum: { amountMinor: 9_999, feeMinor: 999 },
      },
    ]);
    prisma.session.findMany.mockResolvedValue([
      { createdAt: new Date() },
      { createdAt: new Date() },
    ]);
    prisma.payment.findMany.mockResolvedValue([
      { updatedAt: new Date(), amountMinor: 10_000, currency: 'EUR' },
    ]);

    const analytics = await service.analytics();

    expect(analytics.users).toEqual({
      byRole: { amateur: 10, professional: 4, admin: 1 },
      suspended: 2,
      total: 15,
    });
    expect(analytics.sessions).toEqual({ completed_paid: 7 });
    expect(analytics.disputes).toEqual({
      open: 3,
      resolved: { release: 2, refund: 1 },
    });
    // One row per currency; failed attempts never enter the totals.
    expect(analytics.money).toEqual([
      {
        currency: 'EUR',
        heldMinor: 4_000,
        releasedMinor: 10_000,
        refundedMinor: 0,
        feeRevenueMinor: 1_000,
      },
      {
        currency: 'USD',
        heldMinor: 0,
        releasedMinor: 7_000,
        refundedMinor: 0,
        feeRevenueMinor: 700,
      },
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const todayPoint = analytics.trend.at(-1);
    expect(analytics.trend).toHaveLength(30);
    expect(todayPoint).toEqual({
      date: today,
      sessionsCreated: 2,
      released: [{ currency: 'EUR', amountMinor: 10_000 }],
    });
  });
});
