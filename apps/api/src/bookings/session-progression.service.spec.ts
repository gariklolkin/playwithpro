import { ConfigService } from '@nestjs/config';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionProgressionService } from './session-progression.service';
import { SettlementService } from './settlement.service';

const HOUR = 3_600_000;
const WINDOW_HOURS = 48;

describe('SessionProgressionService', () => {
  const prisma = {
    session: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue(WINDOW_HOURS),
  };
  const settlement = { settle: jest.fn() };
  const service = new SessionProgressionService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    settlement as unknown as SettlementService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    config.getOrThrow.mockReturnValue(WINDOW_HOURS);
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
  });

  const paidSession = (
    overrides: Partial<{
      status: SessionStatus;
      startsAt: Date;
      endsAt: Date;
    }> = {},
  ) => ({
    id: 'session-1',
    status: SessionStatus.PAID_ESCROW,
    startsAt: new Date(Date.now() + HOUR),
    endsAt: new Date(Date.now() + 2 * HOUR),
    ...overrides,
  });

  describe('progressedStatus', () => {
    it('keeps a future paid session in escrow', () => {
      expect(service.progressedStatus(paidSession(), Date.now())).toBe(
        SessionStatus.PAID_ESCROW,
      );
    });

    it('starts the session once startsAt passes', () => {
      const session = paidSession({ startsAt: new Date(Date.now() - 1000) });
      expect(service.progressedStatus(session, Date.now())).toBe(
        SessionStatus.IN_PROGRESS,
      );
    });

    it('awaits confirmation once endsAt passes, even from escrow', () => {
      const session = paidSession({
        startsAt: new Date(Date.now() - 2 * HOUR),
        endsAt: new Date(Date.now() - HOUR),
      });
      expect(service.progressedStatus(session, Date.now())).toBe(
        SessionStatus.AWAITING_CONFIRMATION,
      );
    });

    it('stays awaiting confirmation inside the auto-confirm window', () => {
      const session = paidSession({
        status: SessionStatus.AWAITING_CONFIRMATION,
        startsAt: new Date(Date.now() - 3 * HOUR),
        endsAt: new Date(Date.now() - 2 * HOUR),
      });
      expect(service.progressedStatus(session, Date.now())).toBe(
        SessionStatus.AWAITING_CONFIRMATION,
      );
    });

    it('auto-completes once the window elapses', () => {
      const session = paidSession({
        status: SessionStatus.AWAITING_CONFIRMATION,
        startsAt: new Date(Date.now() - (WINDOW_HOURS + 2) * HOUR),
        endsAt: new Date(Date.now() - (WINDOW_HOURS + 1) * HOUR),
      });
      expect(service.progressedStatus(session, Date.now())).toBe(
        SessionStatus.COMPLETED_PAID,
      );
    });

    it('auto-completes a stale escrow session straight through', () => {
      const session = paidSession({
        startsAt: new Date(Date.now() - (WINDOW_HOURS + 2) * HOUR),
        endsAt: new Date(Date.now() - (WINDOW_HOURS + 1) * HOUR),
      });
      expect(service.progressedStatus(session, Date.now())).toBe(
        SessionStatus.COMPLETED_PAID,
      );
    });

    it('never touches unpaid, disputed, or terminal statuses', () => {
      for (const status of [
        SessionStatus.PENDING_PAYMENT,
        SessionStatus.CANCELLED,
        SessionStatus.COMPLETED_PAID,
        SessionStatus.DISPUTED,
        SessionStatus.RESOLVED,
      ]) {
        const session = paidSession({
          status,
          startsAt: new Date(Date.now() - (WINDOW_HOURS + 2) * HOUR),
          endsAt: new Date(Date.now() - (WINDOW_HOURS + 1) * HOUR),
        });
        expect(service.progressedStatus(session, Date.now())).toBe(status);
      }
    });
  });

  describe('normalize', () => {
    it('persists the derived status with a conditional update', async () => {
      const session = paidSession({ startsAt: new Date(Date.now() - 1000) });

      const result = await service.normalize(session);

      expect(result.status).toBe(SessionStatus.IN_PROGRESS);
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: SessionStatus.PAID_ESCROW },
        data: { status: SessionStatus.IN_PROGRESS },
      });
    });

    it('writes nothing when the status is already current', async () => {
      await service.normalize(paidSession());

      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('reports the database status after losing a race', async () => {
      const session = paidSession({ startsAt: new Date(Date.now() - 1000) });
      prisma.session.updateMany.mockResolvedValue({ count: 0 });
      prisma.session.findUnique.mockResolvedValue({
        status: SessionStatus.CANCELLED,
      });

      const result = await service.normalize(session);

      expect(result.status).toBe(SessionStatus.CANCELLED);
    });

    it('never settles money inline, even when auto-completing', async () => {
      const session = paidSession({
        status: SessionStatus.AWAITING_CONFIRMATION,
        startsAt: new Date(Date.now() - (WINDOW_HOURS + 2) * HOUR),
        endsAt: new Date(Date.now() - (WINDOW_HOURS + 1) * HOUR),
      });

      const result = await service.normalize(session);

      expect(result.status).toBe(SessionStatus.COMPLETED_PAID);
      expect(settlement.settle).not.toHaveBeenCalled();
    });
  });

  describe('sweep', () => {
    it('progresses every due session', async () => {
      const started = paidSession({
        startsAt: new Date(Date.now() - 1000),
      });
      const ended = {
        ...paidSession({
          status: SessionStatus.IN_PROGRESS,
          startsAt: new Date(Date.now() - 2 * HOUR),
          endsAt: new Date(Date.now() - HOUR),
        }),
        id: 'session-2',
      };
      prisma.session.findMany.mockResolvedValue([started, ended]);

      await service.sweep();

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: SessionStatus.PAID_ESCROW },
        data: { status: SessionStatus.IN_PROGRESS },
      });
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-2', status: SessionStatus.IN_PROGRESS },
        data: { status: SessionStatus.AWAITING_CONFIRMATION },
      });
      expect(settlement.settle).not.toHaveBeenCalled();
    });

    it('settles sessions it auto-completes', async () => {
      const overdue = paidSession({
        status: SessionStatus.AWAITING_CONFIRMATION,
        startsAt: new Date(Date.now() - (WINDOW_HOURS + 2) * HOUR),
        endsAt: new Date(Date.now() - (WINDOW_HOURS + 1) * HOUR),
      });
      prisma.session.findMany.mockResolvedValue([overdue]);

      await service.sweep();

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: SessionStatus.AWAITING_CONFIRMATION },
        data: { status: SessionStatus.COMPLETED_PAID },
      });
      expect(settlement.settle).toHaveBeenCalledWith('session-1');
    });
  });
});
