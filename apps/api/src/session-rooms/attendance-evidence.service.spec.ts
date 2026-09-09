import type { PrismaService } from '../prisma/prisma.service';
import { AttendanceEvidenceService } from './attendance-evidence.service';

describe('AttendanceEvidenceService', () => {
  const prisma = {
    session: { findUnique: jest.fn() },
    sessionAttendance: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const service = new AttendanceEvidenceService(
    prisma as unknown as PrismaService,
  );
  const session = {
    id: 'sess-1',
    playerId: 'player-1',
    proProfile: { userId: 'coach-1' },
  };
  const at = new Date('2026-09-09T10:00:00Z');
  const event = { roomName: 'slug', identity: 'player-1', at };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.session.findUnique.mockResolvedValue(session);
    prisma.sessionAttendance.updateMany.mockResolvedValue({ count: 1 });
  });

  it('stamps connectedAt on the open row created by join', async () => {
    prisma.sessionAttendance.findFirst.mockResolvedValue({
      id: 'att-1',
      connectedAt: null,
      leftAt: null,
    });
    await service.recordConnected(event);
    expect(prisma.sessionAttendance.updateMany).toHaveBeenCalledWith({
      where: { id: 'att-1', connectedAt: null },
      data: { connectedAt: at },
    });
    expect(prisma.sessionAttendance.create).not.toHaveBeenCalled();
  });

  it('ignores a duplicate connect report', async () => {
    prisma.sessionAttendance.findFirst.mockResolvedValue({
      id: 'att-1',
      connectedAt: at,
      leftAt: null,
    });
    await service.recordConnected(event);
    expect(prisma.sessionAttendance.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessionAttendance.create).not.toHaveBeenCalled();
  });

  it('creates a row when a connect report has no open row', async () => {
    prisma.sessionAttendance.findFirst.mockResolvedValue({
      id: 'att-0',
      connectedAt: new Date('2026-09-09T09:00:00Z'),
      leftAt: new Date('2026-09-09T09:30:00Z'),
    });
    await service.recordConnected(event);
    expect(prisma.sessionAttendance.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'sess-1',
        userId: 'player-1',
        joinedAt: at,
        connectedAt: at,
      },
    });
  });

  it('stamps leftAt on the latest open row', async () => {
    prisma.sessionAttendance.findFirst.mockResolvedValue({ id: 'att-1' });
    await service.recordLeft(event);
    expect(prisma.sessionAttendance.updateMany).toHaveBeenCalledWith({
      where: { id: 'att-1', leftAt: null },
      data: { leftAt: at },
    });
  });

  it('ignores a leave report with no open row', async () => {
    prisma.sessionAttendance.findFirst.mockResolvedValue(null);
    await service.recordLeft(event);
    expect(prisma.sessionAttendance.updateMany).not.toHaveBeenCalled();
  });

  it('ignores unknown rooms and non-party identities', async () => {
    prisma.session.findUnique.mockResolvedValueOnce(null);
    await service.recordConnected(event);
    await service.recordConnected({ ...event, identity: 'stranger' });
    expect(prisma.sessionAttendance.findFirst).not.toHaveBeenCalled();
  });
});
