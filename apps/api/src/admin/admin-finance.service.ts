import { Injectable } from '@nestjs/common';
import {
  ADMIN_ANALYTICS_TREND_DAYS,
  ADMIN_PAYMENTS_PAGE_SIZE,
  AdminAnalyticsResponse,
  AdminCurrencyTotals,
  AdminPaymentListResponse,
  AdminSessionCounts,
  AdminTrendPoint,
  DisputeOutcome as SharedDisputeOutcome,
  PaymentStatus as SharedPaymentStatus,
  Role as SharedRole,
  SessionStatus as SharedSessionStatus,
} from '@playwithpro/shared';
import { DisputeStatus, PaymentStatus, Prisma } from '@prisma/client';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { toSharedRole } from '../users/user.mapper';
import { AdminPaymentsQueryDto } from './dto/admin-payments-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC calendar date (YYYY-MM-DD) of a timestamp. */
function utcDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

@Injectable()
export class AdminFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async listPayments(
    query: AdminPaymentsQueryDto,
  ): Promise<AdminPaymentListResponse> {
    const page = query.page ?? 1;
    const where: Prisma.PaymentWhereInput = query.status
      ? { status: query.status.toUpperCase() as PaymentStatus }
      : {};
    const [total, payments] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * ADMIN_PAYMENTS_PAGE_SIZE,
        take: ADMIN_PAYMENTS_PAGE_SIZE,
        include: {
          session: {
            select: {
              serviceType: true,
              player: { select: { displayName: true } },
              proProfile: {
                select: { user: { select: { displayName: true } } },
              },
            },
          },
        },
      }),
    ]);
    return {
      items: payments.map((payment) => ({
        id: payment.id,
        sessionId: payment.sessionId,
        serviceType: toSharedServiceType(payment.session.serviceType),
        playerDisplayName: payment.session.player.displayName,
        coachDisplayName: payment.session.proProfile.user.displayName,
        provider: payment.provider,
        providerRef: payment.providerRef,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        feeMinor: payment.feeMinor,
        status: payment.status.toLowerCase() as SharedPaymentStatus,
        createdAt: payment.createdAt.toISOString(),
        updatedAt: payment.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize: ADMIN_PAYMENTS_PAGE_SIZE,
    };
  }

  async analytics(): Promise<AdminAnalyticsResponse> {
    const trendStart = new Date(
      Date.now() - (ADMIN_ANALYTICS_TREND_DAYS - 1) * DAY_MS,
    );
    trendStart.setUTCHours(0, 0, 0, 0);

    const [
      usersByRole,
      suspended,
      sessionsByStatus,
      openDisputes,
      resolvedByOutcome,
      moneyGroups,
      trendSessions,
      trendReleases,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
      this.prisma.session.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.dispute.count({ where: { status: DisputeStatus.OPEN } }),
      this.prisma.dispute.groupBy({
        by: ['outcome'],
        where: { status: DisputeStatus.RESOLVED },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['currency', 'status'],
        _sum: { amountMinor: true, feeMinor: true },
      }),
      this.prisma.session.findMany({
        where: { createdAt: { gte: trendStart } },
        select: { createdAt: true },
      }),
      // updatedAt approximates the release moment: a payment row's final
      // write is its terminal status transition.
      this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.RELEASED,
          updatedAt: { gte: trendStart },
        },
        select: { updatedAt: true, amountMinor: true, currency: true },
      }),
    ]);

    const byRole = {
      [SharedRole.Amateur]: 0,
      [SharedRole.Professional]: 0,
      [SharedRole.Admin]: 0,
    };
    let totalUsers = 0;
    for (const group of usersByRole) {
      byRole[toSharedRole(group.role)] = group._count._all;
      totalUsers += group._count._all;
    }

    const sessions: AdminSessionCounts = {};
    for (const group of sessionsByStatus) {
      sessions[group.status.toLowerCase() as SharedSessionStatus] =
        group._count._all;
    }

    const resolved = {
      [SharedDisputeOutcome.Release]: 0,
      [SharedDisputeOutcome.Refund]: 0,
    };
    for (const group of resolvedByOutcome) {
      if (group.outcome) {
        resolved[group.outcome.toLowerCase() as SharedDisputeOutcome] =
          group._count._all;
      }
    }

    // One totals row per currency; amounts of different currencies are
    // never summed together.
    const money = new Map<string, AdminCurrencyTotals>();
    const totalsOf = (currency: string): AdminCurrencyTotals => {
      let totals = money.get(currency);
      if (!totals) {
        totals = {
          currency,
          heldMinor: 0,
          releasedMinor: 0,
          refundedMinor: 0,
          feeRevenueMinor: 0,
        };
        money.set(currency, totals);
      }
      return totals;
    };
    for (const group of moneyGroups) {
      const amount = group._sum.amountMinor ?? 0;
      const totals = totalsOf(group.currency);
      if (group.status === PaymentStatus.HELD) {
        totals.heldMinor += amount;
      } else if (group.status === PaymentStatus.RELEASED) {
        totals.releasedMinor += amount;
        totals.feeRevenueMinor += group._sum.feeMinor ?? 0;
      } else if (group.status === PaymentStatus.REFUNDED) {
        totals.refundedMinor += amount;
      }
    }

    const trend: AdminTrendPoint[] = [];
    const trendIndex = new Map<string, AdminTrendPoint>();
    for (let day = 0; day < ADMIN_ANALYTICS_TREND_DAYS; day += 1) {
      const date = utcDate(new Date(trendStart.getTime() + day * DAY_MS));
      const point: AdminTrendPoint = { date, sessionsCreated: 0, released: [] };
      trend.push(point);
      trendIndex.set(date, point);
    }
    for (const session of trendSessions) {
      const point = trendIndex.get(utcDate(session.createdAt));
      if (point) {
        point.sessionsCreated += 1;
      }
    }
    for (const release of trendReleases) {
      const point = trendIndex.get(utcDate(release.updatedAt));
      if (!point) {
        continue;
      }
      const entry = point.released.find(
        (item) => item.currency === release.currency,
      );
      if (entry) {
        entry.amountMinor += release.amountMinor;
      } else {
        point.released.push({
          currency: release.currency,
          amountMinor: release.amountMinor,
        });
      }
    }

    return {
      users: { byRole, suspended, total: totalUsers },
      sessions,
      disputes: { open: openDisputes, resolved },
      money: [...money.values()].sort((a, b) =>
        a.currency.localeCompare(b.currency),
      ),
      trend,
    };
  }
}
