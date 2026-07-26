/* eslint-disable @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/no-unsafe-return
   -- supertest responses are untyped; assertions cast where it matters. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AdminAnalyticsResponse,
  AdminPaymentListResponse,
  AdminReviewListResponse,
  AdminUserListResponse,
  CatalogResponse,
  ReviewListResponse,
  Role,
  SessionResponse,
} from '@playwithpro/shared';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/prisma/prisma.service';

const HOUR = 3_600_000;

// Booked sessions send real SMTP invites; allow for Mailpit queueing.
jest.setTimeout(20_000);

/** See session-rooms.e2e-spec.ts: retry TRUNCATE past startup-sweep locks. */
async function truncateAll(prisma: PrismaService): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "User", "AvailabilitySlot", "Session", "Payment", "Video", "SessionAttendance", "Dispute", "Review" CASCADE',
      );
      return;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/**
 * Admin console flows against a real Postgres: the suspension lifecycle
 * (sign-in and refresh lockout, unsuspend), review moderation with the
 * aggregate decrement surfacing publicly, and the ledger/analytics reads.
 */
describe('Admin console (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let playerCookie: string;
  let adminCookie: string;

  let playerId: string;
  let adminId: string;
  let coachProfileId: string;

  const PLAYER_EMAIL = 'console-player@e2e.test';
  const PLAYER_PASSWORD = 'password-1';

  const slotIds: string[] = [];
  let nextSlot = 0;

  const server = () => app.getHttpServer();

  /** Books the next free slot, pays, ends it in the past, player-confirms. */
  async function completedSession(): Promise<string> {
    const slotId = slotIds[nextSlot++];
    const booked = await request(server())
      .post('/bookings')
      .set('Cookie', playerCookie)
      .send({ proId: coachProfileId, serviceType: 'consultation', slotId })
      .expect(200);
    const sessionId = (booked.body as SessionResponse).id;
    await request(server())
      .post(`/sessions/${sessionId}/pay`)
      .set('Cookie', playerCookie)
      .send({})
      .expect(200);
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        startsAt: new Date(Date.now() - 2 * HOUR),
        endsAt: new Date(Date.now() - HOUR),
      },
    });
    await request(server())
      .post(`/sessions/${sessionId}/confirm`)
      .set('Cookie', playerCookie)
      .expect(200);
    return sessionId;
  }

  async function review(sessionId: string, rating: number): Promise<void> {
    await request(server())
      .post(`/sessions/${sessionId}/review`)
      .set('Cookie', playerCookie)
      .send({ rating })
      .expect(200);
  }

  async function catalogCard() {
    const catalog = await request(server()).get('/pros').expect(200);
    return (catalog.body as CatalogResponse).items.find(
      (item) => item.id === coachProfileId,
    )!;
  }

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL ?? '';
    if (!process.env.CI && !dbUrl.includes('e2e')) {
      throw new Error(
        'Refusing to run e2e against a non-e2e database. ' +
          'Set DATABASE_URL to a dedicated *e2e* database (see README).',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    await truncateAll(prisma);

    const coach = await prisma.user.create({
      data: {
        email: 'console-coach@e2e.test',
        role: 'PROFESSIONAL',
        displayName: 'Console Coach',
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
    coachProfileId = coach.proProfile!.id;

    for (let i = 0; i < 4; i++) {
      const slot = await prisma.availabilitySlot.create({
        data: {
          profileId: coachProfileId,
          startsAt: new Date(Date.now() + (24 + i) * HOUR),
          endsAt: new Date(Date.now() + (25 + i) * HOUR),
          source: 'MANUAL',
        },
      });
      slotIds.push(slot.id);
    }

    const player = await prisma.user.create({
      data: {
        email: PLAYER_EMAIL,
        role: 'AMATEUR',
        displayName: 'Console Player',
        passwordHash: await argon2.hash(PLAYER_PASSWORD, {
          type: argon2.argon2id,
        }),
        emailVerifiedAt: new Date(),
      },
    });
    playerId = player.id;
    const admin = await prisma.user.create({
      data: {
        email: 'console-admin@e2e.test',
        role: 'ADMIN',
        displayName: 'Console Admin',
      },
    });
    adminId = admin.id;

    const tokens = app.get(TokenService);
    playerCookie = `access_token=${tokens.signAccessToken(player.id, Role.Amateur)}`;
    adminCookie = `access_token=${tokens.signAccessToken(admin.id, Role.Admin)}`;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  describe('user directory', () => {
    it('searches by email fragment and filters by role', async () => {
      const res = await request(server())
        .get('/admin/users?query=console-player&role=amateur')
        .set('Cookie', adminCookie)
        .expect(200);
      const list = res.body as AdminUserListResponse;
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({
        email: PLAYER_EMAIL,
        role: 'amateur',
        suspendedAt: null,
        emailVerified: true,
      });
    });

    it('is admin-only', async () => {
      await request(server())
        .get('/admin/users')
        .set('Cookie', playerCookie)
        .expect(403);
      await request(server()).get('/admin/users').expect(401);
    });
  });

  describe('suspension lifecycle', () => {
    let refreshCookie: string;

    it('the player signs in normally before suspension', async () => {
      const res = await request(server())
        .post('/auth/login')
        .send({ email: PLAYER_EMAIL, password: PLAYER_PASSWORD })
        .expect(200);
      const cookies = res.get('Set-Cookie') ?? [];
      refreshCookie = cookies
        .find((cookie) => cookie.startsWith('refresh_token='))!
        .split(';')[0];
    });

    it('suspension locks out sign-in with the dedicated discriminator', async () => {
      await request(server())
        .post(`/admin/users/${playerId}/suspend`)
        .set('Cookie', adminCookie)
        .expect(200);

      const res = await request(server())
        .post('/auth/login')
        .send({ email: PLAYER_EMAIL, password: PLAYER_PASSWORD })
        .expect(403);
      expect(res.body.error).toBe('account_suspended');
    });

    it('the pre-suspension refresh token is dead', async () => {
      await request(server())
        .post('/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);
    });

    it('the directory shows the suspension', async () => {
      const res = await request(server())
        .get(`/admin/users/${playerId}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(res.body.suspendedAt).toEqual(expect.any(String));
    });

    it('double suspension and admin targets conflict', async () => {
      await request(server())
        .post(`/admin/users/${playerId}/suspend`)
        .set('Cookie', adminCookie)
        .expect(409);
      await request(server())
        .post(`/admin/users/${adminId}/suspend`)
        .set('Cookie', adminCookie)
        .expect(409);
    });

    it('unsuspension restores sign-in', async () => {
      await request(server())
        .post(`/admin/users/${playerId}/unsuspend`)
        .set('Cookie', adminCookie)
        .expect(200);
      await request(server())
        .post(`/admin/users/${playerId}/unsuspend`)
        .set('Cookie', adminCookie)
        .expect(409);
      await request(server())
        .post('/auth/login')
        .send({ email: PLAYER_EMAIL, password: PLAYER_PASSWORD })
        .expect(200);
    });
  });

  describe('review moderation', () => {
    let firstReviewId: string;

    it('deleting a review decrements the public aggregate', async () => {
      await review(await completedSession(), 5);
      await review(await completedSession(), 3);
      expect(await catalogCard()).toMatchObject({
        ratingAvg: 4,
        ratingCount: 2,
      });

      const list = await request(server())
        .get('/admin/reviews')
        .set('Cookie', adminCookie)
        .expect(200);
      const items = (list.body as AdminReviewListResponse).items;
      expect(items).toHaveLength(2);
      firstReviewId = items.find((item) => item.rating === 5)!.id;

      // Reason is mandatory.
      await request(server())
        .delete(`/admin/reviews/${firstReviewId}`)
        .set('Cookie', adminCookie)
        .send({})
        .expect(400);

      await request(server())
        .delete(`/admin/reviews/${firstReviewId}`)
        .set('Cookie', adminCookie)
        .send({ reason: 'Abusive content' })
        .expect(200);

      expect(await catalogCard()).toMatchObject({
        ratingAvg: 3,
        ratingCount: 1,
      });
      const publicList = await request(server())
        .get(`/pros/${coachProfileId}/reviews`)
        .expect(200);
      expect((publicList.body as ReviewListResponse).total).toBe(1);
    });

    it('a second deletion of the same review is a clean 404', async () => {
      await request(server())
        .delete(`/admin/reviews/${firstReviewId}`)
        .set('Cookie', adminCookie)
        .send({ reason: 'again' })
        .expect(404);
      expect(await catalogCard()).toMatchObject({
        ratingAvg: 3,
        ratingCount: 1,
      });
    });

    it('deleting the last review leaves the coach unrated, not zero-rated', async () => {
      const list = await request(server())
        .get('/admin/reviews')
        .set('Cookie', adminCookie)
        .expect(200);
      const remaining = (list.body as AdminReviewListResponse).items[0];
      await request(server())
        .delete(`/admin/reviews/${remaining.id}`)
        .set('Cookie', adminCookie)
        .send({ reason: 'cleanup' })
        .expect(200);
      expect(await catalogCard()).toMatchObject({
        ratingAvg: null,
        ratingCount: 0,
      });
    });

    it('moderation is admin-only', async () => {
      await request(server())
        .get('/admin/reviews')
        .set('Cookie', playerCookie)
        .expect(403);
      await request(server())
        .delete(`/admin/reviews/${firstReviewId}`)
        .set('Cookie', playerCookie)
        .send({ reason: 'nope' })
        .expect(403);
    });
  });

  describe('ledger and analytics', () => {
    it('lists released payments with parties and amounts', async () => {
      const res = await request(server())
        .get('/admin/payments?status=released')
        .set('Cookie', adminCookie)
        .expect(200);
      const ledger = res.body as AdminPaymentListResponse;
      expect(ledger.total).toBe(2);
      expect(ledger.items[0]).toMatchObject({
        status: 'released',
        amountMinor: 5000,
        currency: 'EUR',
        playerDisplayName: 'Console Player',
        coachDisplayName: 'Console Coach',
      });
    });

    it('analytics reports per-currency money and role counts', async () => {
      const res = await request(server())
        .get('/admin/analytics')
        .set('Cookie', adminCookie)
        .expect(200);
      const analytics = res.body as AdminAnalyticsResponse;
      expect(analytics.users.byRole).toMatchObject({
        amateur: 1,
        professional: 1,
        admin: 1,
      });
      expect(analytics.sessions.completed_paid).toBe(2);
      const eur = analytics.money.find((row) => row.currency === 'EUR')!;
      expect(eur.releasedMinor).toBe(10_000);
      expect(eur.feeRevenueMinor).toBeGreaterThan(0);
      expect(analytics.trend).toHaveLength(30);
    });

    it('is admin-only', async () => {
      await request(server())
        .get('/admin/analytics')
        .set('Cookie', playerCookie)
        .expect(403);
    });
  });
});
