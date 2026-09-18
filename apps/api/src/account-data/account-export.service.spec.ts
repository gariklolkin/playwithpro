/* eslint-disable @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access
   -- jest mock call records are untyped; assertions narrow where it matters. */
import { ConflictException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { AccountExportService } from './account-export.service';
import { readZip } from './zip';

describe('AccountExportService', () => {
  const tx = { accountDataRequest: { update: jest.fn() } };
  const prisma = {
    accountDataRequest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findUniqueOrThrow: jest.fn() },
    session: { findMany: jest.fn() },
    video: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const values: Record<string, number> = {
    ACCOUNT_EXPORT_COOLDOWN_HOURS: 24,
    ACCOUNT_EXPORT_TTL_DAYS: 7,
  };
  const config = { getOrThrow: (key: string) => values[key] };
  const storage = {
    presignGet: jest.fn().mockResolvedValue('https://s3/signed'),
    putObject: jest.fn(),
    deleteObject: jest.fn(),
  };
  const notifications = { enqueue: jest.fn() };
  let service: AccountExportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccountExportService(
      prisma as never,
      config as never,
      storage as never,
      notifications as never,
    );
  });

  it('refuses a second export inside the cooldown, naming the next time', async () => {
    const requestedAt = new Date(Date.now() - 3_600_000);
    prisma.accountDataRequest.findFirst.mockResolvedValue({
      status: 'COMPLETED',
      requestedAt,
      exportKey: null,
      exportExpiresAt: null,
    });
    const error = await service.request('u1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'account_export_cooldown',
      nextAllowedAt: new Date(
        requestedAt.getTime() + 24 * 3_600_000,
      ).toISOString(),
    });
    expect(prisma.accountDataRequest.create).not.toHaveBeenCalled();
  });

  it('hands out a short-lived link only while the file is ready', async () => {
    prisma.accountDataRequest.findFirst.mockResolvedValue({
      status: 'COMPLETED',
      requestedAt: new Date(Date.now() - 48 * 3_600_000),
      exportKey: 'exports/u1/r1.zip',
      exportExpiresAt: new Date(Date.now() + 3_600_000),
    });
    const status = await service.status('u1');
    expect(status.downloadUrl).toBe('https://s3/signed');
    expect(storage.presignGet).toHaveBeenCalledWith(
      'exports/u1/r1.zip',
      600,
      'playwithpro-export.zip',
    );
    expect(status.nextAllowedAt).toBeNull();
  });

  it('builds a zip with both files, stores it privately and announces it', async () => {
    prisma.accountDataRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'u1',
      email: 'u1@example.com',
      passwordHash: 'secret-hash',
      avatarKey: 'avatars/u1/a.jpg',
      displayName: 'Uwe',
      playerProfile: { level: 'INTERMEDIATE' },
      proProfile: null,
      legalAcceptances: [{ document: 'terms', version: '1.0' }],
      oauthAccounts: [{ provider: 'google' }],
    });
    prisma.session.findMany.mockResolvedValue([
      {
        id: 's1',
        playerId: 'u1',
        roomSlug: 'secret-room',
        player: { displayName: 'Uwe' },
        proProfile: { user: { displayName: 'Coach Anna' } },
        payments: [{ amountMinor: 5000 }],
        dispute: null,
        review: { rating: 5 },
        attendance: [],
        reschedules: [],
        videos: [
          { video: { id: 'v1', title: 'Serve' }, note: null, position: 0 },
        ],
      },
    ]);
    prisma.video.findMany.mockResolvedValue([
      {
        id: 'v1',
        title: 'Serve',
        sizeBytes: BigInt(1024),
        originalKey: 'videos/u1/v1',
        playbackKey: null,
      },
    ]);
    let stored: Buffer = Buffer.alloc(0);
    storage.putObject.mockImplementation(
      async (_key: string, body: Readable) => {
        const chunks: Buffer[] = [];
        for await (const chunk of body)
          chunks.push(Buffer.from(chunk as Buffer));
        stored = Buffer.concat(chunks);
      },
    );

    await service.build({
      id: 'r1',
      userId: 'u1',
      status: 'SCHEDULED',
    } as never);

    expect(storage.putObject.mock.calls[0][0]).toBe('exports/u1/r1.zip');
    const files = Object.fromEntries(
      readZip(stored).map((m) => [m.name, JSON.parse(m.data.toString())]),
    );
    const account = files['account.json'];
    expect(account.account).not.toHaveProperty('passwordHash');
    expect(account.account).not.toHaveProperty('avatarKey');
    expect(account.linkedAccounts).toEqual([{ provider: 'google' }]);
    expect(account.sessions[0]).toMatchObject({
      role: 'player',
      counterpart: 'Coach Anna',
      clips: [{ videoId: 'v1', title: 'Serve' }],
    });
    expect(account.sessions[0]).not.toHaveProperty('roomSlug');
    expect(files['videos.json']).toEqual([
      { id: 'v1', title: 'Serve', sizeBytes: 1024 },
    ]);
    expect(tx.accountDataRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        exportKey: 'exports/u1/r1.zip',
      }),
    });
    expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        kind: 'ACCOUNT_EXPORT_READY',
        sessionId: null,
      }),
    ]);
  });

  it('sweeps expired files', async () => {
    prisma.accountDataRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'r1', exportKey: 'exports/u1/r1.zip' }]);
    await service.sweepOnce();
    expect(storage.deleteObject).toHaveBeenCalledWith('exports/u1/r1.zip');
    expect(prisma.accountDataRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { exportKey: null },
    });
  });
});
