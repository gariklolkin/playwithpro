import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { UnattachedVideosService } from '../videos/unattached-videos.service';
import { SessionVideosService } from './session-videos.service';
import type { NotificationsService } from '../notifications/notifications.service';

const HOUR = 3_600_000;

describe('SessionVideosService', () => {
  interface ClipRow {
    videoId: string;
    position: number;
    note: string | null;
    addedAt: Date;
  }
  const tx = {
    session: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    sessionVideo: {
      deleteMany: jest.fn(),
      createMany: jest.fn<Promise<unknown>, [{ data: ClipRow[] }]>(),
    },
  };
  const prisma = {
    video: { findMany: jest.fn() },
    session: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const config = {
    getOrThrow: (name: string) =>
      ({ SESSION_VIDEO_MAX_COUNT: 3, SESSION_VIDEO_MAX_TOTAL_MIN: 10 })[name],
  };
  const unattached = { recompute: jest.fn() };
  const notifications = { enqueue: jest.fn(), enqueueDebounced: jest.fn() };
  const service = new SessionVideosService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    unattached as unknown as UnattachedVideosService,
    notifications as unknown as NotificationsService,
  );

  const ready = (id: string, durationSeconds = 60) => ({
    id,
    ownerId: 'player-1',
    status: 'READY',
    durationSeconds,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );
  });

  describe('validate', () => {
    async function rejection(inputs: { videoId: string; note?: string }[]) {
      try {
        await service.validate('player-1', inputs);
      } catch (error) {
        return (error as BadRequestException).getResponse() as Record<
          string,
          unknown
        >;
      }
      throw new Error('expected a rejection');
    }

    it('rejects an empty set', async () => {
      expect(await rejection([])).toMatchObject({ reason: 'empty' });
      expect(prisma.video.findMany).not.toHaveBeenCalled();
    });

    it('rejects a duplicate before touching the database', async () => {
      expect(
        await rejection([{ videoId: 'v1' }, { videoId: 'v1' }]),
      ).toMatchObject({ reason: 'duplicate' });
      expect(prisma.video.findMany).not.toHaveBeenCalled();
    });

    it('rejects more clips than the cap with the numbers', async () => {
      expect(
        await rejection([
          { videoId: 'v1' },
          { videoId: 'v2' },
          { videoId: 'v3' },
          { videoId: 'v4' },
        ]),
      ).toMatchObject({ reason: 'too_many_clips', max: 3, count: 4 });
    });

    it('404s when any clip is unknown or foreign (no existence oracle)', async () => {
      prisma.video.findMany.mockResolvedValue([ready('v1')]);
      await expect(
        service.validate('player-1', [{ videoId: 'v1' }, { videoId: 'v2' }]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['v1', 'v2'] }, ownerId: 'player-1' },
      });
    });

    it('rejects a clip that is not ready', async () => {
      prisma.video.findMany.mockResolvedValue([
        ready('v1'),
        { ...ready('v2'), status: 'PROCESSING' },
      ]);
      expect(
        await rejection([{ videoId: 'v1' }, { videoId: 'v2' }]),
      ).toMatchObject({ reason: 'not_ready' });
    });

    it('rejects a set over the total duration cap with the totals', async () => {
      prisma.video.findMany.mockResolvedValue([
        ready('v1', 400),
        ready('v2', 300),
      ]);
      expect(
        await rejection([{ videoId: 'v1' }, { videoId: 'v2' }]),
      ).toMatchObject({
        reason: 'too_long',
        maxSeconds: 600,
        totalSeconds: 700,
      });
    });

    it('returns the clips in the requested order with normalized notes', async () => {
      prisma.video.findMany.mockResolvedValue([ready('v2'), ready('v1')]);
      const clips = await service.validate('player-1', [
        { videoId: 'v1', note: '  serve ' },
        { videoId: 'v2', note: '' },
      ]);
      expect(clips.map((clip) => clip.video.id)).toEqual(['v1', 'v2']);
      expect(clips.map((clip) => clip.note)).toEqual(['serve', null]);
      expect(service.rowsFor(clips)).toEqual([
        { position: 0, note: 'serve', video: { connect: { id: 'v1' } } },
        { position: 1, note: null, video: { connect: { id: 'v2' } } },
      ]);
    });
  });

  describe('replace', () => {
    const editable = {
      status: 'PAID_ESCROW',
      startsAt: new Date(Date.now() + 24 * HOUR),
      videos: [{ videoId: 'v1', addedAt: new Date('2026-09-01T00:00:00Z') }],
    };

    beforeEach(() => {
      prisma.session.findUnique.mockResolvedValue({
        playerId: 'player-1',
        serviceType: 'VIDEO_ANALYSIS',
        proProfile: { userId: 'coach-1' },
      });
      // Behaves like the real query: only the requested ids come back.
      prisma.video.findMany.mockImplementation(
        ({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            [ready('v1'), ready('v2')].filter((video) =>
              where.id.in.includes(video.id),
            ),
          ),
      );
      tx.session.findUniqueOrThrow.mockResolvedValue(editable);
    });

    it('replaces the set atomically, keeping addedAt for kept clips', async () => {
      await service.replace('player-1', 'session-1', [
        { videoId: 'v2', note: 'loop' },
        { videoId: 'v1' },
      ]);

      expect(tx.sessionVideo.deleteMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1' },
      });
      const rows = tx.sessionVideo.createMany.mock.calls[0][0].data;
      expect(rows.map((row) => [row.videoId, row.position, row.note])).toEqual([
        ['v2', 0, 'loop'],
        ['v1', 1, null],
      ]);
      expect(rows[1].addedAt).toEqual(new Date('2026-09-01T00:00:00Z'));
      // Both the old and the new ids get their retention clock recomputed.
      expect(unattached.recompute).toHaveBeenCalledWith(['v1', 'v2', 'v1']);
    });

    it('404s for a non-owner and 409s for a non-video-analysis session', async () => {
      await expect(
        service.replace('coach-1', 'session-1', [{ videoId: 'v1' }]),
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.session.findUnique.mockResolvedValue({
        playerId: 'player-1',
        serviceType: 'CONSULTATION',
      });
      await expect(
        service.replace('player-1', 'session-1', [{ videoId: 'v1' }]),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.sessionVideo.deleteMany).not.toHaveBeenCalled();
    });

    it('409s once the session has started or left the editable statuses', async () => {
      tx.session.findUniqueOrThrow.mockResolvedValue({
        ...editable,
        startsAt: new Date(Date.now() - HOUR),
      });
      await expect(
        service.replace('player-1', 'session-1', [{ videoId: 'v1' }]),
      ).rejects.toBeInstanceOf(ConflictException);

      tx.session.findUniqueOrThrow.mockResolvedValue({
        ...editable,
        status: 'IN_PROGRESS',
      });
      await expect(
        service.replace('player-1', 'session-1', [{ videoId: 'v1' }]),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.sessionVideo.deleteMany).not.toHaveBeenCalled();
      expect(unattached.recompute).not.toHaveBeenCalled();
    });

    it('applies the same caps as at booking', async () => {
      await expect(
        service.replace('player-1', 'session-1', []),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.sessionVideo.deleteMany).not.toHaveBeenCalled();
    });
  });
});
