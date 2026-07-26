/* eslint-disable @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/no-unsafe-return
   -- supertest responses are untyped; assertions cast where it matters. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AdminDisputeListResponse,
  CatalogResponse,
  PublicProProfileResponse,
  ReviewListResponse,
  Role,
  SessionResponse,
} from '@playwithpro/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/prisma/prisma.service';

const HOUR = 3_600_000;

// Every reviewed session is a book→pay round-trip with a real SMTP invite;
// 5 s flakes when Mailpit queues behind the other suites.
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
 * Full review flow against a real Postgres: eligibility over the session
 * lifecycle, the one-review invariant, and the aggregate surfacing on the
 * public catalog, coach profile, and reviews listing.
 */
describe('Reviews & ratings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let playerCookie: string;
  let rivalCookie: string;
  let coachCookie: string;
  let adminCookie: string;

  let coachProfileId: string;

  const slotIds: string[] = [];
  let nextSlot = 0;

  function futureSlot(hoursAhead: number) {
    return {
      startsAt: new Date(Date.now() + hoursAhead * HOUR),
      endsAt: new Date(Date.now() + (hoursAhead + 1) * HOUR),
    };
  }

  const server = () => app.getHttpServer();

  /** Books the next free slot and pays it into escrow. */
  async function bookAndPay(): Promise<string> {
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
    return sessionId;
  }

  async function setSessionTimes(
    sessionId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: { startsAt, endsAt },
    });
  }

  /** Paid session already past its end, still inside the confirm window. */
  async function paidEndedSession(): Promise<string> {
    const sessionId = await bookAndPay();
    await setSessionTimes(
      sessionId,
      new Date(Date.now() - 2 * HOUR),
      new Date(Date.now() - HOUR),
    );
    return sessionId;
  }

  /** Completed via player confirmation — the canonical reviewable session. */
  async function completedSession(): Promise<string> {
    const sessionId = await paidEndedSession();
    await request(server())
      .post(`/sessions/${sessionId}/confirm`)
      .set('Cookie', playerCookie)
      .expect(200);
    return sessionId;
  }

  async function resolveDispute(
    sessionId: string,
    outcome: 'release' | 'refund',
  ): Promise<void> {
    const list = await request(server())
      .get('/admin/disputes')
      .set('Cookie', adminCookie)
      .expect(200);
    const disputeId = (list.body as AdminDisputeListResponse).open.find(
      (d) => d.sessionId === sessionId,
    )!.id;
    await request(server())
      .post(`/admin/disputes/${disputeId}/resolve`)
      .set('Cookie', adminCookie)
      .send({ outcome })
      .expect(200);
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await truncateAll(prisma);

    const coach = await prisma.user.create({
      data: {
        email: 'review-coach@e2e.test',
        role: 'PROFESSIONAL',
        displayName: 'Review Coach',
        proProfile: {
          create: {
            status: 'VERIFIED',
            bio: 'coaching',
            languages: ['en'],
            services: {
              create: [
                { type: 'CONSULTATION', priceMinor: 4005, currency: 'EUR' },
              ],
            },
          },
        },
      },
      include: { proProfile: true },
    });
    coachProfileId = coach.proProfile!.id;

    for (let i = 0; i < 8; i++) {
      const slot = await prisma.availabilitySlot.create({
        data: {
          profileId: coachProfileId,
          ...futureSlot(24 + i),
          source: 'MANUAL',
        },
      });
      slotIds.push(slot.id);
    }

    const player = await prisma.user.create({
      data: {
        email: 'review-player@e2e.test',
        role: 'AMATEUR',
        displayName: 'Review Player',
      },
    });
    const rival = await prisma.user.create({
      data: {
        email: 'review-rival@e2e.test',
        role: 'AMATEUR',
        displayName: 'Review Rival',
      },
    });
    const admin = await prisma.user.create({
      data: {
        email: 'review-admin@e2e.test',
        role: 'ADMIN',
        displayName: 'Review Admin',
      },
    });

    const tokens = app.get(TokenService);
    playerCookie = `access_token=${tokens.signAccessToken(player.id, Role.Amateur)}`;
    rivalCookie = `access_token=${tokens.signAccessToken(rival.id, Role.Amateur)}`;
    coachCookie = `access_token=${tokens.signAccessToken(coach.id, Role.Professional)}`;
    adminCookie = `access_token=${tokens.signAccessToken(admin.id, Role.Admin)}`;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  describe('review creation', () => {
    let sessionId: string;

    it('player reviews a completed session', async () => {
      sessionId = await completedSession();

      const res = await request(server())
        .post(`/sessions/${sessionId}/review`)
        .set('Cookie', playerCookie)
        .send({ rating: 5, text: 'Sharp, actionable advice' })
        .expect(200);
      const session = res.body as SessionResponse;
      expect(session.review).toMatchObject({
        rating: 5,
        text: 'Sharp, actionable advice',
      });
      expect(session.reviewable).toBe(false);
    });

    it('a second review conflicts', async () => {
      await request(server())
        .post(`/sessions/${sessionId}/review`)
        .set('Cookie', playerCookie)
        .send({ rating: 1 })
        .expect(409);
    });

    it('guards the caller and the payload', async () => {
      await request(server())
        .post(`/sessions/${sessionId}/review`)
        .set('Cookie', rivalCookie)
        .send({ rating: 5 })
        .expect(404);
      await request(server())
        .post(`/sessions/${sessionId}/review`)
        .set('Cookie', coachCookie)
        .send({ rating: 5 })
        .expect(403);
      const fresh = await completedSession();
      await request(server())
        .post(`/sessions/${fresh}/review`)
        .set('Cookie', playerCookie)
        .send({ rating: 6 })
        .expect(400);
      await request(server())
        .post(`/sessions/${fresh}/review`)
        .set('Cookie', playerCookie)
        .send({ rating: 4 })
        .expect(200);
    });

    it('an unfinished session conflicts', async () => {
      const awaiting = await paidEndedSession();
      await request(server())
        .post(`/sessions/${awaiting}/review`)
        .set('Cookie', playerCookie)
        .send({ rating: 5 })
        .expect(409);
      // Leave it disputed→refunded for the eligibility check below.
      await request(server())
        .post(`/sessions/${awaiting}/dispute`)
        .set('Cookie', playerCookie)
        .send({ reason: 'Never happened' })
        .expect(200);
      await resolveDispute(awaiting, 'refund');
      await request(server())
        .post(`/sessions/${awaiting}/review`)
        .set('Cookie', playerCookie)
        .send({ rating: 1 })
        .expect(409);
    });

    it('a dispute resolved for the coach is reviewable', async () => {
      const disputed = await paidEndedSession();
      await request(server())
        .post(`/sessions/${disputed}/dispute`)
        .set('Cookie', playerCookie)
        .send({ reason: 'Felt too short' })
        .expect(200);
      await resolveDispute(disputed, 'release');

      const res = await request(server())
        .post(`/sessions/${disputed}/review`)
        .set('Cookie', playerCookie)
        .send({ rating: 2 })
        .expect(200);
      expect((res.body as SessionResponse).review).toMatchObject({
        rating: 2,
        text: null,
      });
    });

    it('a stale session past auto-confirm is normalized and reviewed in one request', async () => {
      const stale = await bookAndPay();
      await setSessionTimes(
        stale,
        new Date(Date.now() - 50 * HOUR),
        new Date(Date.now() - 49 * HOUR),
      );

      const res = await request(server())
        .post(`/sessions/${stale}/review`)
        .set('Cookie', playerCookie)
        .send({ rating: 5 })
        .expect(200);
      expect((res.body as SessionResponse).status).toBe('completed_paid');
    });
  });

  describe('public exposure', () => {
    // Ratings so far: 5, 4, 2, 5 → avg 4.0 of 4 reviews.
    it('aggregate shows on the catalog card and public profile', async () => {
      const catalog = await request(server()).get('/pros').expect(200);
      const card = (catalog.body as CatalogResponse).items.find(
        (item) => item.id === coachProfileId,
      );
      expect(card).toMatchObject({ ratingAvg: 4, ratingCount: 4 });

      const profile = await request(server())
        .get(`/pros/${coachProfileId}/profile`)
        .expect(200);
      expect(profile.body as PublicProProfileResponse).toMatchObject({
        ratingAvg: 4,
        ratingCount: 4,
      });
    });

    it('anonymous visitors read the reviews newest first', async () => {
      const res = await request(server())
        .get(`/pros/${coachProfileId}/reviews`)
        .expect(200);
      const list = res.body as ReviewListResponse;
      expect(list.total).toBe(4);
      expect(list.items[0]).toMatchObject({
        rating: 5,
        playerDisplayName: 'Review Player',
        serviceType: 'consultation',
      });
      expect(list.items.map((item) => item.rating)).toEqual([5, 2, 4, 5]);
      expect(
        list.items.find((item) => item.text === 'Sharp, actionable advice'),
      ).toBeTruthy();
    });

    it('reviews of an unknown profile yield not-found', async () => {
      await request(server())
        .get('/pros/00000000-0000-0000-0000-000000000000/reviews')
        .expect(404);
    });
  });
});
