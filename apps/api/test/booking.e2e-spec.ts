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
  VideoResponse,
} from '@playwithpro/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/prisma/prisma.service';

const HOUR = 3_600_000;

// Paying sends calendar invites over SMTP, which stretches those round-trips.
jest.setTimeout(20_000);

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
    playerCookie = `access_token=${tokens.signAccessToken(
      playerId,
      Role.Amateur,
    )}`;
    rivalCookie = `access_token=${tokens.signAccessToken(
      rivalId,
      Role.Amateur,
    )}`;
    coachCookie = `access_token=${tokens.signAccessToken(
      coachId,
      Role.Professional,
    )}`;
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
          goal: '  Work on my backhand loop  ',
        })
        .expect(200);
      const session = res.body as SessionResponse;
      sessionId = session.id;
      expect(session.status).toBe('pending_payment');
      expect(session.priceMinor).toBe(4005);
      expect(session.expiresAt).toBeTruthy();
      expect(session.goal).toBe('Work on my backhand loop');
      expect(session.playerContext).toBeNull();

      // Unpaid: the coach reads the goal but never the player's card.
      const coachView = await request(server())
        .get(`/sessions/${sessionId}`)
        .set('Cookie', coachCookie)
        .expect(200);
      expect(coachView.body.goal).toBe('Work on my backhand loop');
      expect(coachView.body.playerContext).toBeNull();

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

    it('embeds the player card for the coach once paid, never for the player', async () => {
      const coachView = await request(server())
        .get(`/sessions/${sessionId}`)
        .set('Cookie', coachCookie)
        .expect(200);
      expect(coachView.body.playerContext).toMatchObject({
        userId: playerId,
        displayName: 'E2E Player',
        // The e2e player never saved a profile: the card says so.
        filled: false,
      });

      const coachList = await request(server())
        .get('/sessions')
        .set('Cookie', coachCookie)
        .expect(200);
      const entry = (coachList.body as SessionListResponse).upcoming.find(
        (s) => s.id === sessionId,
      );
      expect(entry?.playerContext?.displayName).toBe('E2E Player');

      const playerView = await request(server())
        .get(`/sessions/${sessionId}`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect(playerView.body.playerContext).toBeNull();
      expect(playerView.body.goal).toBe('Work on my backhand loop');
    });

    it('lets the player edit the goal until start; coach forbidden, oversize rejected', async () => {
      const edited = await request(server())
        .patch(`/sessions/${sessionId}/goal`)
        .set('Cookie', playerCookie)
        .send({ goal: 'Serve and receive' })
        .expect(200);
      expect(edited.body.goal).toBe('Serve and receive');

      await request(server())
        .patch(`/sessions/${sessionId}/goal`)
        .set('Cookie', coachCookie)
        .send({ goal: 'nope' })
        .expect(403);

      await request(server())
        .patch(`/sessions/${sessionId}/goal`)
        .set('Cookie', playerCookie)
        .send({ goal: 'x'.repeat(501) })
        .expect(400);

      const cleared = await request(server())
        .patch(`/sessions/${sessionId}/goal`)
        .set('Cookie', playerCookie)
        .send({ goal: null })
        .expect(200);
      expect(cleared.body.goal).toBeNull();

      // Once the slot started the goal is frozen, whatever the status.
      const before = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
        select: { startsAt: true, endsAt: true },
      });
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          startsAt: new Date(Date.now() - 10 * 60_000),
          endsAt: new Date(Date.now() + 50 * 60_000),
        },
      });
      await request(server())
        .patch(`/sessions/${sessionId}/goal`)
        .set('Cookie', playerCookie)
        .send({ goal: 'too late' })
        .expect(409);
      await prisma.session.update({
        where: { id: sessionId },
        data: { ...before, status: 'PAID_ESCROW' },
      });
    });

    it('keeps the player lookup endpoint for admins only', async () => {
      const admin = await prisma.user.create({
        data: {
          email: 'admin.players@e2e.test',
          role: 'ADMIN',
          displayName: 'E2E Admin',
        },
      });
      const adminCookie = `access_token=${app
        .get(TokenService)
        .signAccessToken(admin.id, Role.Admin)}`;

      await request(server())
        .get(`/players/${playerId}`)
        .set('Cookie', coachCookie)
        .expect(403);
      const card = await request(server())
        .get(`/players/${playerId}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(card.body.displayName).toBe('E2E Player');
      expect(card.body.filled).toBe(false);
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

    it('lets the player release an unpaid booking and reopens the slot', async () => {
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

      await request(server())
        .post(`/sessions/${sessionId}/cancel`)
        .set('Cookie', coachCookie)
        .send({})
        .expect(409);

      const released = await request(server())
        .post(`/sessions/${sessionId}/cancel`)
        .set('Cookie', playerCookie)
        .send({})
        .expect(200);
      expect((released.body as SessionResponse).status).toBe('cancelled');
      expect((released.body as SessionResponse).escrow).toBeNull();

      const slot = await prisma.availabilitySlot.findUnique({
        where: { id: slotIds[2] },
      });
      expect(slot!.status).toBe('OPEN');
      expect(await prisma.payment.count({ where: { sessionId } })).toBe(0);

      // The released slot is real inventory again, not a phantom.
      const rebooked = await request(server())
        .post('/bookings')
        .set('Cookie', rivalCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'consultation',
          slotId: slotIds[2],
        })
        .expect(200);
      await request(server())
        .post(`/sessions/${(rebooked.body as SessionResponse).id}/cancel`)
        .set('Cookie', rivalCookie)
        .send({})
        .expect(200);
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

    let secondVideoId: string;

    beforeAll(async () => {
      const second = await prisma.video.create({
        data: {
          ownerId: playerId,
          title: 'serve drill',
          status: 'READY',
          originalKey: `videos/${playerId}/v2/original.mp4`,
          playbackKey: `videos/${playerId}/v2/original.mp4`,
          durationSeconds: 45,
        },
      });
      secondVideoId = second.id;
    });

    it('rejects a foreign clip, a missing set, a duplicate, and the legacy videoId field', async () => {
      const foreign = await prisma.video.create({
        data: {
          ownerId: rivalId,
          title: 'not yours',
          status: 'READY',
          originalKey: 'videos/x/original.mp4',
        },
      });
      const booking = (videos: unknown) =>
        request(server())
          .post('/bookings')
          .set('Cookie', playerCookie)
          .send({
            proId: coachProfileId,
            serviceType: 'video_analysis',
            slotId: slotIds[3],
            ...(videos === undefined ? {} : { videos }),
          });
      await booking([{ videoId: foreign.id }]).expect(404);
      const empty = await booking(undefined).expect(400);
      expect(empty.body.reason).toBe('empty');
      const duplicate = await booking([{ videoId }, { videoId }]).expect(400);
      expect(duplicate.body.reason).toBe('duplicate');
      // The pre-change contract is not silently honored.
      await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'video_analysis',
          slotId: slotIds[3],
          videoId,
        })
        .expect(400);
    });

    it('rejects a set over the clip-count cap naming the cap', async () => {
      const extra = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          prisma.video.create({
            data: {
              ownerId: playerId,
              title: `drill ${i}`,
              status: 'READY',
              originalKey: `videos/${playerId}/x${i}/original.mp4`,
              durationSeconds: 10,
            },
          }),
        ),
      );
      const res = await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'video_analysis',
          slotId: slotIds[3],
          videos: [{ videoId }, ...extra.map((v) => ({ videoId: v.id }))],
        })
        .expect(400);
      expect(res.body).toMatchObject({
        reason: 'too_many_clips',
        max: 5,
        count: 6,
      });
      await prisma.video.deleteMany({
        where: { id: { in: extra.map((v) => v.id) } },
      });
    });

    it('denies the coach before payment and grants viewing after', async () => {
      const res = await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'video_analysis',
          slotId: slotIds[3],
          videos: [{ videoId, note: ' match ' }, { videoId: secondVideoId }],
        })
        .expect(200);
      const created = res.body as SessionResponse;
      sessionId = created.id;
      expect(created.videos).toEqual([
        expect.objectContaining({
          videoId,
          title: 'my technique',
          note: 'match',
          durationSeconds: 60,
          position: 0,
        }),
        expect.objectContaining({
          videoId: secondVideoId,
          note: null,
          position: 1,
        }),
      ]);
      // Attaching stops the retention clock on both clips.
      const clocks = await prisma.video.findMany({
        where: { id: { in: [videoId, secondVideoId] } },
        select: { unattachedSince: true },
      });
      expect(clocks.every((v) => v.unattachedSince === null)).toBe(true);

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
      // Every clip of the set, not only the first.
      await request(server())
        .get(`/videos/${secondVideoId}/playback-url`)
        .set('Cookie', coachCookie)
        .expect(200);
    });

    it('lets the player replace the set until start; the coach sees it and loses access to removed clips', async () => {
      await request(server())
        .put(`/sessions/${sessionId}/videos`)
        .set('Cookie', coachCookie)
        .send({ videos: [{ videoId }] })
        .expect(403);

      const res = await request(server())
        .put(`/sessions/${sessionId}/videos`)
        .set('Cookie', playerCookie)
        .send({ videos: [{ videoId: secondVideoId, note: 'serve' }] })
        .expect(200);
      expect((res.body as SessionResponse).videos).toEqual([
        expect.objectContaining({ videoId: secondVideoId, note: 'serve' }),
      ]);

      const coachList = await request(server())
        .get('/sessions')
        .set('Cookie', coachCookie)
        .expect(200);
      const seen = (coachList.body as SessionListResponse).upcoming.find(
        (s) => s.id === sessionId,
      );
      expect(seen?.videos.map((v) => v.videoId)).toEqual([secondVideoId]);

      await request(server())
        .get(`/videos/${videoId}/playback-url`)
        .set('Cookie', coachCookie)
        .expect(404);
      // The removed clip's retention clock starts; the kept one stays clear.
      const removed = await prisma.video.findUniqueOrThrow({
        where: { id: videoId },
      });
      expect(removed.unattachedSince).not.toBeNull();
      const kept = await prisma.video.findUniqueOrThrow({
        where: { id: secondVideoId },
      });
      expect(kept.unattachedSince).toBeNull();

      // Put it back for the remaining tests.
      await request(server())
        .put(`/sessions/${sessionId}/videos`)
        .set('Cookie', playerCookie)
        .send({ videos: [{ videoId }, { videoId: secondVideoId }] })
        .expect(200);

      // Two edits in a row → one debounced "clips changed" row for the
      // coach, due ~15 minutes after the last edit.
      const rows = await prisma.notification.findMany({
        where: { sessionId, kind: 'SESSION_CLIPS_CHANGED' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].recipientId).toBe(coachId);
      expect(rows[0].status).toBe('PENDING');
      expect(rows[0].dueAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    });

    it('rejects a replace once the session has started', async () => {
      await prisma.session.update({
        where: { id: sessionId },
        data: { startsAt: new Date(Date.now() - 60_000) },
      });
      await request(server())
        .put(`/sessions/${sessionId}/videos`)
        .set('Cookie', playerCookie)
        .send({ videos: [{ videoId }] })
        .expect(409);
      await prisma.session.update({
        where: { id: sessionId },
        data: { startsAt: new Date(Date.now() + 4 * HOUR) },
      });
    });

    it('shows the library limits, usage, and attachment counts to the owner', async () => {
      const res = await request(server())
        .get('/videos')
        .set('Cookie', playerCookie)
        .expect(200);
      expect(res.body.limits).toMatchObject({
        file: { maxSizeBytes: 2048 * 1024 * 1024 },
        session: { maxClips: 5, maxTotalSeconds: 3600 },
        library: { maxVideos: 20 },
      });
      const mine = (res.body.videos as VideoResponse[]).find(
        (v) => v.id === videoId,
      );
      expect(mine?.attachedUpcomingSessions).toBe(1);
      expect(mine?.expiresAt).toBeNull();
    });

    it('refuses upload initiation once the library count cap is reached', async () => {
      await prisma.video.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({
          ownerId: rivalId,
          title: `filler ${i}`,
          status: 'READY' as const,
          originalKey: `videos/${rivalId}/f${i}/original.mp4`,
          sizeBytes: BigInt(1024),
        })),
      });
      const res = await request(server())
        .post('/videos')
        .set('Cookie', rivalCookie)
        .send({
          fileName: 'more.mp4',
          contentType: 'video/mp4',
          sizeBytes: 1024,
        })
        .expect(409);
      expect(res.body).toMatchObject({
        reason: 'library_full_count',
        maxVideos: 20,
      });
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
      expect(withVideo?.videos.map((v) => v.videoId)).toEqual([
        videoId,
        secondVideoId,
      ]);
      expect(withVideo?.videos[0].title).toBe('my technique');
    });
  });
});
