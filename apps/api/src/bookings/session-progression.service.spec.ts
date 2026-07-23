import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionProgressionService } from './session-progression.service';

const HOUR = 3_600_000;

describe('SessionProgressionService', () => {
  const prisma = {
    session: { updateMany: jest.fn(), findMany: jest.fn() },
  };
  const service = new SessionProgressionService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
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

    it('never touches unpaid or terminal statuses', () => {
      for (const status of [
        SessionStatus.PENDING_PAYMENT,
        SessionStatus.CANCELLED,
        SessionStatus.COMPLETED_PAID,
      ]) {
        const session = paidSession({
          status,
          startsAt: new Date(Date.now() - 2 * HOUR),
          endsAt: new Date(Date.now() - HOUR),
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
    });
  });
});
