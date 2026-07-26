import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Role } from '@playwithpro/shared';
import { ServiceType, SessionStatus } from '@prisma/client';
import type { SessionProgressionService } from '../bookings/session-progression.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SessionRoomsService } from './session-rooms.service';

const MINUTE = 60_000;

describe('SessionRoomsService.authorizePlaybackSync', () => {
  const prisma = { session: { findUnique: jest.fn() } };
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === 'ROOM_JOIN_WINDOW_BEFORE_MIN' ? 15 : 30,
    ),
  };
  const progression = {
    normalize: jest.fn((session: unknown) => Promise.resolve(session)),
  };
  const video = { getRoom: jest.fn() };
  const service = new SessionRoomsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    progression as unknown as SessionProgressionService,
    video,
  );

  const player = { id: 'player-1', role: Role.Amateur };
  const coach = { id: 'coach-1', role: Role.Professional };

  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'sess-1',
    playerId: 'player-1',
    proProfile: { userId: 'coach-1', user: { displayName: 'Coach' } },
    player: { id: 'player-1', displayName: 'Player' },
    video: { id: 'video-1', title: 'Match footage' },
    serviceType: ServiceType.VIDEO_ANALYSIS,
    status: SessionStatus.IN_PROGRESS,
    roomSlug: 'slug',
    startsAt: new Date(Date.now() - 10 * MINUTE),
    endsAt: new Date(Date.now() + 50 * MINUTE),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    progression.normalize.mockImplementation((s: unknown) =>
      Promise.resolve(s),
    );
  });

  it('admits both parties of an in-window video-analysis session', async () => {
    prisma.session.findUnique.mockResolvedValue(session());
    await expect(
      service.authorizePlaybackSync(player, 'sess-1'),
    ).resolves.toBeUndefined();
    await expect(
      service.authorizePlaybackSync(coach, 'sess-1'),
    ).resolves.toBeUndefined();
  });

  it('rejects a user who is not a party', async () => {
    prisma.session.findUnique.mockResolvedValue(session());
    await expect(
      service.authorizePlaybackSync(
        { id: 'other', role: Role.Amateur },
        'sess-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects admins — no oversight pass-through on the sync channel', async () => {
    prisma.session.findUnique.mockResolvedValue(session());
    await expect(
      service.authorizePlaybackSync(
        { id: 'admin', role: Role.Admin },
        'sess-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects sessions of other service types', async () => {
    prisma.session.findUnique.mockResolvedValue(
      session({ serviceType: ServiceType.CONSULTATION }),
    );
    await expect(
      service.authorizePlaybackSync(player, 'sess-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects outside the join window', async () => {
    prisma.session.findUnique.mockResolvedValue(
      session({
        status: SessionStatus.PAID_ESCROW,
        startsAt: new Date(Date.now() + 120 * MINUTE),
        endsAt: new Date(Date.now() + 180 * MINUTE),
      }),
    );
    await expect(
      service.authorizePlaybackSync(player, 'sess-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects sessions outside room-eligible statuses', async () => {
    const cancelled = session();
    prisma.session.findUnique.mockResolvedValue(cancelled);
    progression.normalize.mockResolvedValue({
      ...cancelled,
      status: SessionStatus.CANCELLED,
    });
    await expect(
      service.authorizePlaybackSync(player, 'sess-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unknown sessions', async () => {
    prisma.session.findUnique.mockResolvedValue(null);
    await expect(
      service.authorizePlaybackSync(player, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
