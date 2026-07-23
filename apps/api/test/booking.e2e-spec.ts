/* eslint-disable @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/no-unsafe-return
   -- supertest responses are untyped; assertions cast where it matters. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MOCK_DECLINE_INSTRUMENT,
  Role,
  SessionListResponse,
  SessionResponse,
} from '@playwithpro/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/prisma/prisma.service';

const HOUR = 3_600_000;

/**
 * The startup catch-up sweeps (booking expiry, session progression) can hold
 * row locks right after app.init(); TRUNCATE loses that race with a deadlock,
 * so retry briefly instead of flaking.
 */
async function truncateAll(prisma: PrismaService): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "User", "AvailabilitySlot", "Session", "Payment", "Video", "SessionAttendance" CASCADE',
      );
      return;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/**
 * Booking/payment flow against a real Postgres (CI service container or a
 * dedicated local `*e2e*` database). Refuses to run elsewhere so it can
 * truncate tables freely.
 */
describe('Booking & escrow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let playerCookie: string;
  let rivalCookie: string;
  let coachCookie: string;

  let coachProfileId: string;
  let playerId: string;
  let rivalId: string;
  let coachId: string;
  let videoId: string;

  const slotIds: string[] = [];

  function futureSlot(hoursAhead: number) {
    return {
      startsAt: new Date(Date.now() + hoursAhead * HOUR),
      endsAt: new Date(Date.now() + (hoursAhead + 1) * HOUR),
    };
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
        email: 'coach@e2e.test',
        role: 'PROFESSIONAL',
        displayName: 'E2E Coach',
        proProfile: {
          create: {
            status: 'VERIFIED',
            bio: 'coaching',
            languages: ['en', 'de'],
            services: {
              create: [
                { type: 'CONSULTATION', priceMinor: 4005, currency: 'EUR' },
                { type: 'VIDEO_ANALYSIS', priceMinor: 6000, currency: 'EUR' },
              ],
            },
          },
        },
      },
      include: { proProfile: true },
    });
    coachId = coach.id;
    coachProfileId = coach.proProfile!.id;

    // An unverified coach must never surface in the catalog.
    await prisma.user.create({
      data: {
        email: 'draft-coach@e2e.test',
        role: 'PROFESSIONAL',
        displayName: 'Draft Coach',
        proProfile: {
          create: {
            status: 'DRAFT',
            services: {
              create: [
                { type: 'CONSULTATION', priceMinor: 1000, currency: 'EUR' },
              ],
            },
          },
        },
      },
    });

    for (let i = 0; i < 5; i++) {
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
        email: 'player@e2e.test',
        role: 'AMATEUR',
        displayName: 'E2E Player',
      },
    });
    playerId = player.id;
    const rival = await prisma.user.create({
      data: {
        email: 'rival@e2e.test',
        role: 'AMATEUR',
        displayName: 'E2E Rival',
      },
    });
    rivalId = rival.id;

    const video = await prisma.video.create({
      data: {
        ownerId: playerId,
        title: 'my technique',
        status: 'READY',
        originalKey: `videos/${playerId}/v/original.mp4`,
        playbackKey: `videos/${playerId}/v/original.mp4`,
        durationSeconds: 60,
      },
    });
    videoId = video.id;

    const tokens = app.get(TokenService);
    playerCookie = `access_token=${tokens.signAccessToken(playerId, Role.Amateur)}`;
    rivalCookie = `access_token=${tokens.signAccessToken(rivalId, Role.Amateur)}`;
    coachCookie = `access_token=${tokens.signAccessToken(coachId, Role.Professional)}`;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  describe('catalog', () => {
    it('lists only the verified coach with price-from and next slot', async () => {
      const res = await request(server()).get('/pros').expect(200);
      expect(res.body.total).toBe(1);
      const [card] = res.body.items;
      expect(card.displayName).toBe('E2E Coach');
      expect(card.priceFromMinor).toBe(4005);
      expect(card.nextSlotAt).toBeTruthy();
    });

    it('filters by languages and services+price on the same service', async () => {
      const none = await request(server())
        .get('/pros?languages=fr')
        .expect(200);
      expect(none.body.total).toBe(0);

      const priced = await request(server())
        .get('/pros?serviceTypes=video_analysis&maxPriceMinor=5000')
        .expect(200);
      expect(priced.body.total).toBe(0);

      const match = await request(server())
        .get('/pros?serviceTypes=consultation&maxPriceMinor=5000&languages=de')
        .expect(200);
      expect(match.body.total).toBe(1);

      // Multi-select: any selected language and any selected service can match,
      // but price still binds to the same service that matched the type.
      const multi = await request(server())
        .get(
          '/pros?languages=fr,de&serviceTypes=video_analysis,consultation&maxPriceMinor=5000',
        )
        .expect(200);
      expect(multi.body.total).toBe(1);

      const multiPriced = await request(server())
        .get('/pros?serviceTypes=video_analysis,game&maxPriceMinor=5000')
        .expect(200);
      expect(multiPriced.body.total).toBe(0);
    });

    it('serves the public profile and 404s the unverified one', async () => {
      const res = await request(server())
        .get(`/pros/${coachProfileId}/profile`)
        .expect(200);
      expect(res.body.services).toHaveLength(2);

      const draft = await prisma.proProfile.findFirst({
        where: { status: 'DRAFT' },
      });
      await request(server()).get(`/pros/${draft!.id}/profile`).expect(404);
    });
  });

  describe('booking → pay → escrow', () => {
    let sessionId: string;

    it('books a consultation slot into pending_payment', async () => {
      const res = await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'consultation',
          slotId: slotIds[0],
        })
        .expect(200);
      const session = res.body as SessionResponse;
      sessionId = session.id;
      expect(session.status).toBe('pending_payment');
      expect(session.priceMinor).toBe(4005);
      expect(session.expiresAt).toBeTruthy();

      const slot = await prisma.availabilitySlot.findUnique({
        where: { id: slotIds[0] },
      });
      expect(slot!.status).toBe('BOOKED');
    });

    it('declines the sentinel instrument and keeps the session payable', async () => {
      const res = await request(server())
        .post(`/sessions/${sessionId}/pay`)
        .set('Cookie', playerCookie)
        .send({ instrument: MOCK_DECLINE_INSTRUMENT })
        .expect(200);
      expect(res.body.paymentStatus).toBe('failed');
      expect(res.body.declineReason).toBe('card_declined');
      expect(res.body.session.status).toBe('pending_payment');
    });

    it('holds funds on retry and reaches paid_escrow', async () => {
      const res = await request(server())
        .post(`/sessions/${sessionId}/pay`)
        .set('Cookie', playerCookie)
        .send({})
        .expect(200);
      expect(res.body.paymentStatus).toBe('held');
      expect(res.body.session.status).toBe('paid_escrow');
      expect(res.body.session.expiresAt).toBeNull();

      const payments = await prisma.payment.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      });
      expect(payments.map((p) => p.status)).toEqual(['FAILED', 'HELD']);
      expect(payments[1].providerRef).toBe(`mock-hold-${sessionId}`);
      expect(payments[1].feeMinor).toBe(401);
    });

    it('rejects a second payment', async () => {
      await request(server())
        .post(`/sessions/${sessionId}/pay`)
        .set('Cookie', playerCookie)
        .send({})
        .expect(409);
    });

    it('shows the session to both parties and hides it from others', async () => {
      const mine = await request(server())
        .get('/sessions')
        .set('Cookie', playerCookie)
        .expect(200);
      const list = mine.body as SessionListResponse;
      expect(list.upcoming.map((s) => s.id)).toContain(sessionId);

      const coachView = await request(server())
        .get(`/sessions/${sessionId}`)
        .set('Cookie', coachCookie)
        .expect(200);
      expect(coachView.body.player.displayName).toBe('E2E Player');

      await request(server())
        .get(`/sessions/${sessionId}`)
        .set('Cookie', rivalCookie)
        .expect(404);
    });
  });

  describe('slot contention and expiry', () => {
    it('lets exactly one of two concurrent bookings win a slot', async () => {
      const book = (cookie: string) =>
        request(server()).post('/bookings').set('Cookie', cookie).send({
          proId: coachProfileId,
          serviceType: 'consultation',
          slotId: slotIds[1],
        });
      const [a, b] = await Promise.all([book(playerCookie), book(rivalCookie)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });

    it('rejects booking an already-booked slot', async () => {
      await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'consultation',
          slotId: slotIds[0],
        })
        .expect(409);
    });

    it('expires a late payment, cancels the session, and reopens the slot', async () => {
      const res = await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'consultation',
          slotId: slotIds[2],
        })
        .expect(200);
      const sessionId = (res.body as SessionResponse).id;
      await prisma.session.update({
        where: { id: sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(server())
        .post(`/sessions/${sessionId}/pay`)
        .set('Cookie', playerCookie)
        .send({})
        .expect(409);

      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });
      expect(session!.status).toBe('CANCELLED');
      const slot = await prisma.availabilitySlot.findUnique({
        where: { id: slotIds[2] },
      });
      expect(slot!.status).toBe('OPEN');
    });
  });

  describe('video attachment and coach access', () => {
    let sessionId: string;

    it('rejects a foreign video and a missing video', async () => {
      const foreign = await prisma.video.create({
        data: {
          ownerId: rivalId,
          title: 'not yours',
          status: 'READY',
          originalKey: 'videos/x/original.mp4',
        },
      });
      await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'video_analysis',
          slotId: slotIds[3],
          videoId: foreign.id,
        })
        .expect(404);

      await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'video_analysis',
          slotId: slotIds[3],
        })
        .expect(400);
    });

    it('denies the coach before payment and grants viewing after', async () => {
      const res = await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'video_analysis',
          slotId: slotIds[3],
          videoId,
        })
        .expect(200);
      sessionId = (res.body as SessionResponse).id;

      // Unpaid session grants nothing.
      await request(server())
        .get(`/videos/${videoId}`)
        .set('Cookie', coachCookie)
        .expect(404);

      await request(server())
        .post(`/sessions/${sessionId}/pay`)
        .set('Cookie', playerCookie)
        .send({})
        .expect(200);

      const meta = await request(server())
        .get(`/videos/${videoId}`)
        .set('Cookie', coachCookie)
        .expect(200);
      expect(meta.body.title).toBe('my technique');
      await request(server())
        .get(`/videos/${videoId}/playback-url`)
        .set('Cookie', coachCookie)
        .expect(200);
    });

    it('keeps management and download owner-only for the coach', async () => {
      // Management endpoints are amateur-role-gated: the coach is rejected
      // before any lookup, so nothing about the video's existence leaks.
      await request(server())
        .patch(`/videos/${videoId}`)
        .set('Cookie', coachCookie)
        .send({ title: 'hijack' })
        .expect(403);
      await request(server())
        .delete(`/videos/${videoId}`)
        .set('Cookie', coachCookie)
        .expect(403);
      await request(server())
        .get(`/videos/${videoId}/download-url`)
        .set('Cookie', coachCookie)
        .expect(403);
      await request(server())
        .get('/videos')
        .set('Cookie', coachCookie)
        .expect(403);
    });

    it('coach session list links the attached video', async () => {
      const res = await request(server())
        .get('/sessions')
        .set('Cookie', coachCookie)
        .expect(200);
      const list = res.body as SessionListResponse;
      const withVideo = list.upcoming.find((s) => s.id === sessionId);
      expect(withVideo?.videoId).toBe(videoId);
      expect(withVideo?.videoTitle).toBe('my technique');
    });
  });
});
