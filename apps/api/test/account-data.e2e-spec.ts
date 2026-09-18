/* eslint-disable @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/no-unsafe-call,
   @typescript-eslint/no-unsafe-return
   -- supertest responses are untyped; assertions cast where it matters. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AdminAccountRequestItem,
  CatalogResponse,
  DeletionStatusResponse,
  ExportStatusResponse,
  LegalDocument,
  Role,
  currentLegalVersion,
} from '@playwithpro/shared';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import type { Readable } from 'node:stream';
import request from 'supertest';
import { AccountDeletionService } from '../src/account-data/account-deletion.service';
import { readZip } from '../src/account-data/zip';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/auth/token.service';
import { MailerService } from '../src/mailer/mailer.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { acceptCurrentLegal } from './legal-helper';

const HOUR = 3_600_000;
const PASSWORD = 'correct-horse-battery';

jest.setTimeout(20_000);

/** See session-rooms.e2e-spec.ts: retry TRUNCATE past startup-sweep locks. */
async function truncateAll(prisma: PrismaService): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "User", "AvailabilitySlot", "Session", "Payment", "Video", "Notification" CASCADE',
      );
      return;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/** Object storage in memory: CI has no MinIO, and the suite checks prefixes. */
class FakeStorage {
  readonly objects = new Map<string, Buffer>();
  async putObject(key: string, body: Readable): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Buffer));
    this.objects.set(key, Buffer.concat(chunks));
  }
  deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
  abortMultipartUpload(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
  listPrefix(prefix: string): Promise<string[]> {
    return Promise.resolve(
      [...this.objects.keys()].filter((key) => key.startsWith(prefix)),
    );
  }
  async deletePrefix(prefix: string): Promise<number> {
    const keys = await this.listPrefix(prefix);
    keys.forEach((key) => this.objects.delete(key));
    return keys.length;
  }
  presignGet(key: string): Promise<string> {
    return Promise.resolve(`https://storage.test/${key}?signed`);
  }
  avatarUrl(key: string): string {
    return `https://api.test/${key}`;
  }
}

/** Captures every email; the code for Google-only accounts is read from it. */
const mailer = {
  deliver: jest.fn(),
  send: jest.fn().mockResolvedValue(true),
  directSentToday: jest.fn().mockReturnValue(0),
  sendVerificationEmail: jest.fn(),
};

/**
 * Account deletion and export against a real Postgres: blockers,
 * re-authentication, the grace period (guards, visibility, cancel), the
 * export zip, execution into a tombstone, postponement, the admin path
 * and re-registration with the freed address.
 */
describe('Account data rights (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let deletion: AccountDeletionService;
  let tokens: TokenService;
  const storage = new FakeStorage();

  let playerId: string;
  let coachId: string;
  let coachProfileId: string;
  let googleId: string;
  let adminId: string;
  let playerCookie: string;
  let coachCookie: string;
  let googleCookie: string;
  let adminCookie: string;
  let bookedSlotId: string;
  let openSlotId: string;
  let paidSessionId: string;
  let videoId: string;

  const server = () => app.getHttpServer();
  const cookieOf = (id: string, role: Role) =>
    `access_token=${tokens.signAccessToken(id, role)}`;

  async function slot(hoursAhead: number, status: 'OPEN' | 'BOOKED' = 'OPEN') {
    return prisma.availabilitySlot.create({
      data: {
        profileId: coachProfileId,
        startsAt: new Date(Date.now() + hoursAhead * HOUR),
        endsAt: new Date(Date.now() + (hoursAhead + 1) * HOUR),
        source: 'MANUAL',
        status,
      },
    });
  }

  async function session(
    playerUserId: string,
    status: 'PAID_ESCROW' | 'COMPLETED_PAID' | 'PENDING_PAYMENT',
    hoursAhead: number,
  ) {
    const booked = await slot(hoursAhead, 'BOOKED');
    return prisma.session.create({
      data: {
        playerId: playerUserId,
        proProfileId: coachProfileId,
        serviceType: 'CONSULTATION',
        priceMinor: 5000,
        currency: 'EUR',
        platformFeeMinor: 750,
        slotId: booked.id,
        status,
        startsAt: booked.startsAt,
        endsAt: booked.endsAt,
        ...(status === 'PENDING_PAYMENT'
          ? { expiresAt: new Date(Date.now() + HOUR) }
          : {}),
      },
    });
  }

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL ?? '';
    if (!process.env.CI && !dbUrl.includes('e2e')) {
      throw new Error(
        'Refusing to run e2e against a non-e2e database. ' +
          'Set DATABASE_URL to a dedicated *e2e* database (see README).',
      );
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(MailerService)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    deletion = app.get(AccountDeletionService);
    tokens = app.get(TokenService);
    await truncateAll(prisma);

    const hash = await argon2.hash(PASSWORD);
    const coach = await prisma.user.create({
      data: {
        email: 'data-coach@e2e.test',
        role: 'PROFESSIONAL',
        displayName: 'Data Coach',
        emailVerifiedAt: new Date(),
        passwordHash: hash,
        proProfile: {
          create: {
            status: 'VERIFIED',
            bio: 'coaching',
            languages: ['en'],
            services: {
              create: [
                { type: 'CONSULTATION', priceMinor: 5000, currency: 'EUR' },
              ],
            },
          },
        },
      },
      include: { proProfile: true },
    });
    coachId = coach.id;
    coachProfileId = coach.proProfile!.id;
    await prisma.availabilityRule.create({
      data: {
        profileId: coachProfileId,
        weekday: 1,
        startMinute: 600,
        endMinute: 720,
      },
    });
    openSlotId = (await slot(72)).id;

    const player = await prisma.user.create({
      data: {
        email: 'data-player@e2e.test',
        role: 'AMATEUR',
        displayName: 'Data Player',
        emailVerifiedAt: new Date(),
        passwordHash: hash,
        avatarKey: 'avatars/placeholder.jpg',
        playerProfile: { create: { level: 'INTERMEDIATE' } },
      },
    });
    playerId = player.id;
    await prisma.user.update({
      where: { id: playerId },
      data: { avatarKey: `avatars/${playerId}/a.jpg` },
    });
    storage.objects.set(`avatars/${playerId}/a.jpg`, Buffer.from('img'));
    storage.objects.set(`avatars/${playerId}/orphan.jpg`, Buffer.from('img'));
    const video = await prisma.video.create({
      data: {
        ownerId: playerId,
        title: 'Forehand',
        status: 'READY',
        originalKey: `videos/${playerId}/v1/original.mp4`,
        playbackKey: `videos/${playerId}/v1/playback.mp4`,
        sizeBytes: BigInt(2048),
      },
    });
    videoId = video.id;
    storage.objects.set(video.originalKey, Buffer.from('mp4'));
    storage.objects.set(video.playbackKey!, Buffer.from('mp4'));

    const google = await prisma.user.create({
      data: {
        email: 'data-google@e2e.test',
        role: 'AMATEUR',
        displayName: 'Google Only',
        oauthAccounts: {
          create: { provider: 'google', providerAccountId: 'g-123' },
        },
      },
    });
    googleId = google.id;
    const admin = await prisma.user.create({
      data: {
        email: 'data-admin@e2e.test',
        role: 'ADMIN',
        displayName: 'Admin',
      },
    });
    adminId = admin.id;

    await acceptCurrentLegal(prisma);
    playerCookie = cookieOf(playerId, Role.Amateur);
    coachCookie = cookieOf(coachId, Role.Professional);
    googleCookie = cookieOf(googleId, Role.Amateur);
    adminCookie = cookieOf(adminId, Role.Admin);

    // A paid session: the player's blocker, the coach's clip access.
    const paid = await session(playerId, 'PAID_ESCROW', 48);
    paidSessionId = paid.id;
    bookedSlotId = paid.slotId;
    await prisma.payment.create({
      data: {
        sessionId: paid.id,
        provider: 'mock',
        amountMinor: 5000,
        currency: 'EUR',
        feeMinor: 750,
        status: 'HELD',
      },
    });
    await prisma.sessionVideo.create({
      data: { sessionId: paid.id, videoId, position: 0 },
    });
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  describe('request', () => {
    it('lists the paid session and the held payment as blockers', async () => {
      const res = await request(server())
        .post('/users/me/deletion')
        .set('Cookie', playerCookie)
        .send({ password: PASSWORD })
        .expect(409);
      expect(res.body.code).toBe('account_deletion_blocked');
      expect(res.body.blockers).toEqual([
        expect.objectContaining({
          kind: 'session',
          sessionId: paidSessionId,
          status: 'paid_escrow',
          role: 'player',
        }),
      ]);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: playerId },
      });
      expect(user.deletionScheduledFor).toBeNull();
    });

    it('the coach sees the same session from the other side', async () => {
      const res = await request(server())
        .get('/users/me/deletion')
        .set('Cookie', coachCookie)
        .expect(200);
      const status = res.body as DeletionStatusResponse;
      expect(status.blockers).toEqual([
        expect.objectContaining({ sessionId: paidSessionId, role: 'coach' }),
      ]);
      expect(status.reauth).toBe('password');
      expect(status.graceDays).toBe(14);
    });

    it('needs the right password', async () => {
      await prisma.session.update({
        where: { id: paidSessionId },
        data: { status: 'COMPLETED_PAID' },
      });
      await prisma.payment.updateMany({
        where: { sessionId: paidSessionId },
        data: { status: 'RELEASED' },
      });
      const res = await request(server())
        .post('/users/me/deletion')
        .set('Cookie', playerCookie)
        .send({ password: 'wrong' })
        .expect(400);
      expect(res.body.code).toBe('account_reauth_required');
    });

    it('schedules the deletion, signs other sessions out and keeps this browser in', async () => {
      const pending = await session(playerId, 'PENDING_PAYMENT', 96);
      await prisma.refreshToken.create({
        data: {
          userId: playerId,
          tokenHash: 'other-device',
          expiresAt: new Date(Date.now() + 24 * HOUR),
        },
      });
      const res = await request(server())
        .post('/users/me/deletion')
        .set('Cookie', playerCookie)
        .send({ password: PASSWORD })
        .expect(200);
      const status = res.body as DeletionStatusResponse;
      const days =
        (Date.parse(status.scheduledFor!) - Date.now()) / (24 * HOUR);
      expect(days).toBeGreaterThan(13.9);
      expect(String(res.headers['set-cookie'])).toContain('refresh_token=');

      const other = await prisma.refreshToken.findFirstOrThrow({
        where: { tokenHash: 'other-device' },
      });
      expect(other.revokedAt).not.toBeNull();
      const cancelled = await prisma.session.findUniqueOrThrow({
        where: { id: pending.id },
      });
      expect(cancelled.status).toBe('CANCELLED');
      const mail = await prisma.notification.findMany({
        where: { recipientId: playerId, kind: 'ACCOUNT_DELETION_REQUESTED' },
      });
      expect(mail).toHaveLength(1);
      expect(mail[0].sessionId).toBeNull();
    });

    it('sign-in still works and carries the schedule', async () => {
      const res = await request(server())
        .post('/auth/login')
        .send({ email: 'data-player@e2e.test', password: PASSWORD })
        .expect(200);
      expect(res.body.user.deletionScheduledFor).not.toBeNull();
    });

    it('refuses commitments during the grace period', async () => {
      const res = await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'consultation',
          slotId: openSlotId,
        })
        .expect(409);
      expect(res.body.code).toBe('account_deletion_pending');
      await request(server())
        .post('/videos')
        .set('Cookie', playerCookie)
        .send({
          title: 'x',
          fileName: 'x.mp4',
          contentType: 'video/mp4',
          sizeBytes: 1000,
        })
        .expect(409);
    });

    it('closes the coach access to the player clips', async () => {
      await request(server())
        .get(`/videos/${videoId}`)
        .set('Cookie', coachCookie)
        .expect(404);
    });
  });

  describe('export', () => {
    it('builds the zip right away, during the grace period too', async () => {
      const res = await request(server())
        .post('/users/me/export')
        .set('Cookie', playerCookie)
        .expect(200);
      const status = res.body as ExportStatusResponse;
      expect(status.status).toBe('completed');
      expect(status.downloadUrl).toMatch(/^https:\/\/storage\.test\/exports\//);
      expect(status.nextAllowedAt).not.toBeNull();

      const key = [...storage.objects.keys()].find((k) =>
        k.startsWith(`exports/${playerId}/`),
      )!;
      const files = Object.fromEntries(
        readZip(storage.objects.get(key)!).map((m) => [
          m.name,
          JSON.parse(m.data.toString()),
        ]),
      );
      const account = files['account.json'];
      expect(account.account.email).toBe('data-player@e2e.test');
      expect(account.account).not.toHaveProperty('passwordHash');
      expect(account.playerProfile.level).toBe('INTERMEDIATE');
      expect(account.legalAcceptances.length).toBeGreaterThan(0);
      const paid = account.sessions.find(
        (s: { id: string }) => s.id === paidSessionId,
      );
      expect(paid).toMatchObject({ role: 'player', counterpart: 'Data Coach' });
      expect(paid.payments[0].amountMinor).toBe(5000);
      expect(files['videos.json']).toEqual([
        expect.objectContaining({
          id: videoId,
          title: 'Forehand',
          sizeBytes: 2048,
        }),
      ]);
      expect(files['videos.json'][0]).not.toHaveProperty('originalKey');
      const ready = await prisma.notification.count({
        where: { recipientId: playerId, kind: 'ACCOUNT_EXPORT_READY' },
      });
      expect(ready).toBe(1);
    });

    it('refuses a second export within the cooldown', async () => {
      const res = await request(server())
        .post('/users/me/export')
        .set('Cookie', playerCookie)
        .expect(409);
      expect(res.body.code).toBe('account_export_cooldown');
    });
  });

  describe('cancel', () => {
    it('restores the account', async () => {
      const res = await request(server())
        .delete('/users/me/deletion')
        .set('Cookie', playerCookie)
        .expect(200);
      expect((res.body as DeletionStatusResponse).scheduledFor).toBeNull();
      const row = await prisma.accountDataRequest.findFirstOrThrow({
        where: { userId: playerId, kind: 'DELETION' },
      });
      expect(row.status).toBe('CANCELLED');
      await request(server())
        .get(`/videos/${videoId}`)
        .set('Cookie', coachCookie)
        .expect(200);
    });
  });

  describe('coach request', () => {
    it('the coach leaves the catalog and the market at once', async () => {
      await request(server())
        .post('/users/me/deletion')
        .set('Cookie', coachCookie)
        .send({ password: PASSWORD })
        .expect(200);
      const catalog = await request(server()).get('/pros').expect(200);
      expect(
        (catalog.body as CatalogResponse).items.map((item) => item.id),
      ).not.toContain(coachProfileId);
      await request(server())
        .get(`/pros/${coachProfileId}/profile`)
        .expect(404);
      const open = await prisma.availabilitySlot.findUniqueOrThrow({
        where: { id: openSlotId },
      });
      expect(open.status).toBe('REMOVED');
      const booked = await prisma.availabilitySlot.findUniqueOrThrow({
        where: { id: bookedSlotId },
      });
      expect(booked.status).toBe('BOOKED');
      expect(
        await prisma.availabilityRule.count({
          where: { profileId: coachProfileId },
        }),
      ).toBe(0);
    });

    it('postpones when a blocker appeared during the grace period', async () => {
      await session(playerId, 'PAID_ESCROW', 120);
      await prisma.accountDataRequest.updateMany({
        where: { userId: coachId, status: 'SCHEDULED' },
        data: { scheduledFor: new Date(Date.now() - 1000) },
      });
      await deletion.runDue();
      const row = await prisma.accountDataRequest.findFirstOrThrow({
        where: { userId: coachId, kind: 'DELETION' },
      });
      expect(row.status).toBe('POSTPONED');
      expect(row.postponedAt).not.toBeNull();
      expect(row.scheduledFor.getTime()).toBeGreaterThan(
        Date.now() + 6 * 24 * HOUR,
      );
      expect(
        await prisma.notification.count({
          where: { recipientId: coachId, kind: 'ACCOUNT_DELETION_POSTPONED' },
        }),
      ).toBe(1);
    });
  });

  describe('execution', () => {
    it('turns the player into a tombstone and keeps the money trail', async () => {
      await prisma.session.updateMany({
        where: { playerId, status: 'PAID_ESCROW' },
        data: { status: 'COMPLETED_PAID' },
      });
      await request(server())
        .post('/users/me/deletion')
        .set('Cookie', playerCookie)
        .send({ password: PASSWORD })
        .expect(200);
      await prisma.accountDataRequest.updateMany({
        where: { userId: playerId, status: 'SCHEDULED' },
        data: { scheduledFor: new Date(Date.now() - 1000) },
      });

      await deletion.runDue();

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: playerId },
      });
      expect(user).toMatchObject({
        email: `deleted-${playerId}@invalid`,
        displayName: '',
        passwordHash: null,
        avatarKey: null,
        deletionScheduledFor: null,
      });
      expect(user.deletedAt).not.toBeNull();
      expect(
        await prisma.playerProfile.count({ where: { userId: playerId } }),
      ).toBe(0);
      expect(await prisma.video.count({ where: { ownerId: playerId } })).toBe(
        0,
      );
      expect(await storage.listPrefix(`avatars/${playerId}/`)).toEqual([]);
      expect(await storage.listPrefix(`videos/${playerId}/`)).toEqual([]);
      expect(
        await prisma.session.count({ where: { playerId } }),
      ).toBeGreaterThan(0);
      expect(
        await prisma.payment.count({ where: { session: { playerId } } }),
      ).toBe(1);

      const row = await prisma.accountDataRequest.findFirstOrThrow({
        where: { userId: playerId, kind: 'DELETION', status: 'COMPLETED' },
      });
      const steps = row.steps as Record<string, { status: string }>;
      expect(steps.avatars.status).toBe('done');
      expect(steps.observability.status).toBe('skipped');
      expect(steps.tombstone.status).toBe('done');
      expect(mailer.send).toHaveBeenCalledWith(
        'data-player@e2e.test',
        expect.objectContaining({ subject: 'Your account was deleted' }),
      );
    });

    it('frees the address for a new registration', async () => {
      await request(server())
        .post('/auth/register')
        .send({
          email: 'data-player@e2e.test',
          password: PASSWORD,
          displayName: 'Back Again',
          role: 'amateur',
          acceptedTerms: currentLegalVersion(LegalDocument.Terms).version,
          acceptedPrivacy: currentLegalVersion(LegalDocument.Privacy).version,
        })
        .expect(201);
    });
  });

  describe('Google-only account', () => {
    it('re-authenticates with an emailed code', async () => {
      await request(server())
        .post('/users/me/deletion')
        .set('Cookie', googleCookie)
        .send({})
        .expect(400);
      mailer.deliver.mockClear();
      await request(server())
        .post('/users/me/deletion/code')
        .set('Cookie', googleCookie)
        .expect(200);
      const mail = mailer.deliver.mock.calls[0][1] as { text: string };
      const code = /\b(\d{6})\b/.exec(mail.text)![1];
      await request(server())
        .post('/users/me/deletion')
        .set('Cookie', googleCookie)
        .send({ code })
        .expect(200);
    });
  });

  describe('admin', () => {
    it('refuses to delete oneself', async () => {
      await request(server())
        .post(`/admin/users/${adminId}/deletion`)
        .set('Cookie', adminCookie)
        .send({ reason: 'test' })
        .expect(403);
    });

    it('schedules an immediate deletion with a reason and lists it', async () => {
      const target = await prisma.user.create({
        data: {
          email: 'data-target@e2e.test',
          role: 'AMATEUR',
          displayName: 'T',
        },
      });
      await request(server())
        .post(`/admin/users/${target.id}/deletion`)
        .set('Cookie', adminCookie)
        .send({ reason: 'request by email', graceDays: 0 })
        .expect(200);
      const log = await request(server())
        .get('/admin/account-requests')
        .set('Cookie', adminCookie)
        .expect(200);
      const row = (log.body as AdminAccountRequestItem[]).find(
        (item) => item.userId === target.id,
      )!;
      expect(row).toMatchObject({
        kind: 'deletion',
        status: 'scheduled',
        initiatedBy: 'admin',
        adminId,
        reason: 'request by email',
      });
      expect(
        await prisma.notification.count({
          where: { recipientId: target.id, kind: 'ACCOUNT_DELETION_BY_ADMIN' },
        }),
      ).toBe(1);
      await request(server())
        .post(`/admin/account-requests/${row.id}/retry`)
        .set('Cookie', adminCookie)
        .expect(409);

      await deletion.runDue();
      const done = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      });
      expect(done.deletedAt).not.toBeNull();
    });

    it('is admin-only', async () => {
      await request(server())
        .get('/admin/account-requests')
        .set('Cookie', coachCookie)
        .expect(403);
    });
  });
});
