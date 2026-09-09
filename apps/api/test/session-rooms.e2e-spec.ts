/* eslint-disable @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access
   -- supertest responses are untyped; assertions cast where it matters. */
import { createHash } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  Role,
  SessionListResponse,
  SessionResponse,
  SessionRoomResponse,
} from '@playwithpro/shared';
import cookieParser from 'cookie-parser';
import { AccessToken, TokenVerifier } from 'livekit-server-sdk';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/prisma/prisma.service';

const HOUR = 3_600_000;
const MINUTE = 60_000;

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
 * Session rooms, attendance, and clock-driven progression against a real
 * Postgres (CI service container or a dedicated local `*e2e*` database).
 */
describe('Session rooms & calendar (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let playerCookie: string;
  let rivalCookie: string;
  let coachCookie: string;

  let adminCookie: string;

  let coachProfileId: string;
  let playerId: string;
  let rivalId: string;

  const slotIds: string[] = [];

  function futureSlot(hoursAhead: number) {
    return {
      startsAt: new Date(Date.now() + hoursAhead * HOUR),
      endsAt: new Date(Date.now() + (hoursAhead + 1) * HOUR),
    };
  }

  /** Books slot `slotIndex` for `serviceType` and pays it into escrow. */
  async function bookAndPay(
    serviceType: string,
    slotIndex: number,
  ): Promise<string> {
    const booked = await request(server())
      .post('/bookings')
      .set('Cookie', playerCookie)
      .send({ proId: coachProfileId, serviceType, slotId: slotIds[slotIndex] })
      .expect(200);
    const sessionId = (booked.body as SessionResponse).id;
    await request(server())
      .post(`/sessions/${sessionId}/pay`)
      .set('Cookie', playerCookie)
      .send({})
      .expect(200);
    return sessionId;
  }

  /** Shifts the session's slot times so `now` sits inside/outside the window. */
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
    // Mirrors main.ts: raw body + webhook content type for LiveKit signatures.
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    app.useBodyParser('json', {
      type: ['application/json', 'application/webhook+json'],
    });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await truncateAll(prisma);

    const coach = await prisma.user.create({
      data: {
        email: 'rooms-coach@e2e.test',
        role: 'PROFESSIONAL',
        displayName: 'Rooms Coach',
        proProfile: {
          create: {
            status: 'VERIFIED',
            bio: 'coaching',
            languages: ['en'],
            services: {
              create: [
                { type: 'CONSULTATION', priceMinor: 4005, currency: 'EUR' },
                {
                  type: 'GAME',
                  priceMinor: 3000,
                  currency: 'EUR',
                  venueLabel: 'TT Club Berlin, Hall 2',
                },
              ],
            },
          },
        },
      },
      include: { proProfile: true },
    });
    coachProfileId = coach.proProfile!.id;

    for (let i = 0; i < 6; i++) {
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
        email: 'rooms-player@e2e.test',
        role: 'AMATEUR',
        displayName: 'Rooms Player',
      },
    });
    playerId = player.id;
    const rival = await prisma.user.create({
      data: {
        email: 'rooms-rival@e2e.test',
        role: 'AMATEUR',
        displayName: 'Rooms Rival',
      },
    });
    rivalId = rival.id;

    const admin = await prisma.user.create({
      data: {
        email: 'rooms-admin@e2e.test',
        role: 'ADMIN',
        displayName: 'Rooms Admin',
      },
    });

    const tokens = app.get(TokenService);
    adminCookie = `access_token=${tokens.signAccessToken(admin.id, Role.Admin)}`;
    playerCookie = `access_token=${tokens.signAccessToken(playerId, Role.Amateur)}`;
    rivalCookie = `access_token=${tokens.signAccessToken(rival.id, Role.Amateur)}`;
    coachCookie = `access_token=${tokens.signAccessToken(coach.id, Role.Professional)}`;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  const LIVEKIT_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
  const LIVEKIT_SECRET = process.env.LIVEKIT_API_SECRET ?? 'secret';

  /** Posts a LiveKit-style webhook, signed the way livekit-server signs it. */
  async function postWebhook(
    event: Record<string, unknown>,
    expectedStatus: number,
    options: { signed?: boolean; secret?: string } = {},
  ): Promise<void> {
    const body = JSON.stringify(event);
    const req = request(server())
      .post('/livekit/webhook')
      .set('Content-Type', 'application/webhook+json');
    if (options.signed !== false) {
      const token = new AccessToken(
        LIVEKIT_KEY,
        options.secret ?? LIVEKIT_SECRET,
        { ttl: 60 },
      );
      token.sha256 = createHash('sha256').update(body).digest('base64');
      req.set('Authorization', await token.toJwt());
    }
    await req.send(body).expect(expectedStatus);
  }

  describe('payment mints room + invite', () => {
    let sessionId: string;

    it('paid online session gets a room slug and one invite', async () => {
      sessionId = await bookAndPay('consultation', 0);

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.roomSlug).toBeTruthy();
      expect(session.inviteSentAt).toBeTruthy();
    });

    it('room access matrix: parties see timing, third party 404s', async () => {
      const playerView = await request(server())
        .get(`/sessions/${sessionId}/room`)
        .set('Cookie', playerCookie)
        .expect(200);
      const room = playerView.body as SessionRoomResponse;
      // Slot is ~24h ahead: timing is public to parties, the room is not.
      expect(room.room).toBeNull();
      expect(room.opensAt).toBeTruthy();
      expect(room.closesAt).toBeTruthy();
      expect(room.counterpartName).toBe('Rooms Coach');

      await request(server())
        .get(`/sessions/${sessionId}/room`)
        .set('Cookie', coachCookie)
        .expect(200);

      await request(server())
        .get(`/sessions/${sessionId}/room`)
        .set('Cookie', rivalCookie)
        .expect(404);
    });

    it('joining too early is rejected', async () => {
      await request(server())
        .post(`/sessions/${sessionId}/room/join`)
        .set('Cookie', playerCookie)
        .expect(409);
    });

    it('releases the descriptor inside the window and logs attendance', async () => {
      await setSessionTimes(
        sessionId,
        new Date(Date.now() - 5 * MINUTE),
        new Date(Date.now() + 55 * MINUTE),
      );

      const res = await request(server())
        .get(`/sessions/${sessionId}/room`)
        .set('Cookie', playerCookie)
        .expect(200);
      const room = res.body as SessionRoomResponse;
      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(room.room).toEqual({
        kind: 'livekit',
        url: expect.stringMatching(/^wss?:\/\//) as string,
        roomName: session.roomSlug,
      });
      // Session already started → clock-driven progression applied inline.
      expect(room.status).toBe('in_progress');

      const first = await request(server())
        .post(`/sessions/${sessionId}/room/join`)
        .set('Cookie', playerCookie)
        .expect(200);
      const rejoin = await request(server())
        .post(`/sessions/${sessionId}/room/join`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect(rejoin.body.attendanceId).not.toBe(first.body.attendanceId);

      // The token is a LiveKit JWT bound to this user and this room only.
      const claims = await new TokenVerifier(
        LIVEKIT_KEY,
        LIVEKIT_SECRET,
      ).verify(first.body.token as string);
      expect(claims.sub).toBe(playerId);
      expect(claims.video).toMatchObject({
        room: session.roomSlug,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      });

      const rows = await prisma.sessionAttendance.findMany({
        where: { sessionId, userId: playerId },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.leftAt === null)).toBe(true);
      expect(rows.every((row) => row.connectedAt === null)).toBe(true);

      // The leave endpoint is gone: evidence now arrives via webhooks.
      await request(server())
        .post(`/sessions/${sessionId}/room/leave`)
        .set('Cookie', playerCookie)
        .send({ attendanceId: rejoin.body.attendanceId })
        .expect(404);
    });

    it('admins read timing but cannot join', async () => {
      const res = await request(server())
        .get(`/sessions/${sessionId}/room`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect((res.body as SessionRoomResponse).room).not.toBeNull();

      await request(server())
        .post(`/sessions/${sessionId}/room/join`)
        .set('Cookie', adminCookie)
        .expect(404);
    });

    it('signed webhooks stamp connection evidence; unsigned are rejected', async () => {
      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      const joinedAtSec = Math.floor(Date.now() / 1000) - 30;
      const joined = {
        event: 'participant_joined',
        id: 'evt-1',
        createdAt: joinedAtSec,
        room: { name: session.roomSlug },
        participant: { identity: playerId, joinedAt: joinedAtSec },
      };

      await postWebhook(joined, 401, { signed: false });
      await postWebhook(joined, 401, { secret: 'wrong-secret-long-enough-x' });
      await postWebhook(joined, 200);
      // Redelivery must not add or change anything.
      await postWebhook(joined, 200);

      let rows = await prisma.sessionAttendance.findMany({
        where: { sessionId, userId: playerId },
        orderBy: { joinedAt: 'asc' },
      });
      expect(rows).toHaveLength(2);
      const connected = rows.filter((row) => row.connectedAt !== null);
      expect(connected).toHaveLength(1);
      expect(connected[0].connectedAt!.getTime()).toBe(joinedAtSec * 1000);

      await postWebhook(
        {
          event: 'participant_left',
          id: 'evt-2',
          createdAt: joinedAtSec + 20,
          room: { name: session.roomSlug },
          participant: { identity: playerId, joinedAt: joinedAtSec },
        },
        200,
      );
      rows = await prisma.sessionAttendance.findMany({
        where: { sessionId, userId: playerId, leftAt: { not: null } },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].leftAt!.getTime()).toBe((joinedAtSec + 20) * 1000);

      // Unknown room and non-party identity are ignored, never errors.
      await postWebhook({ ...joined, room: { name: 'nope' } }, 200);
      await postWebhook(
        {
          ...joined,
          participant: { identity: rivalId, joinedAt: joinedAtSec },
        },
        200,
      );
      expect(
        await prisma.sessionAttendance.count({ where: { userId: rivalId } }),
      ).toBe(0);
    });

    it('progresses to awaiting_confirmation after the end, room open in grace', async () => {
      await setSessionTimes(
        sessionId,
        new Date(Date.now() - 2 * HOUR),
        new Date(Date.now() - 10 * MINUTE),
      );

      const detail = await request(server())
        .get(`/sessions/${sessionId}`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect(detail.body.status).toBe('awaiting_confirmation');

      // 10 minutes past endsAt is inside the 30-minute grace window.
      const res = await request(server())
        .get(`/sessions/${sessionId}/room`)
        .set('Cookie', coachCookie)
        .expect(200);
      expect((res.body as SessionRoomResponse).room).not.toBeNull();
    });

    it('closes the room after the grace window', async () => {
      await setSessionTimes(
        sessionId,
        new Date(Date.now() - 3 * HOUR),
        new Date(Date.now() - 2 * HOUR),
      );

      const res = await request(server())
        .get(`/sessions/${sessionId}/room`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect((res.body as SessionRoomResponse).room).toBeNull();

      await request(server())
        .post(`/sessions/${sessionId}/room/join`)
        .set('Cookie', playerCookie)
        .expect(409);
    });
  });

  describe('game sessions', () => {
    let sessionId: string;

    it('paid game session mints no room and carries the venue', async () => {
      sessionId = await bookAndPay('game', 1);

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.roomSlug).toBeNull();
      expect(session.inviteSentAt).toBeTruthy();

      const detail = await request(server())
        .get(`/sessions/${sessionId}`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect(detail.body.venue).toBe('TT Club Berlin, Hall 2');
      expect(detail.body.room).toBeNull();
    });

    it('has no room route, even for parties', async () => {
      await request(server())
        .get(`/sessions/${sessionId}/room`)
        .set('Cookie', playerCookie)
        .expect(404);
    });
  });

  describe('unpaid sessions', () => {
    it('pending_payment session has no active room', async () => {
      const booked = await request(server())
        .post('/bookings')
        .set('Cookie', playerCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'consultation',
          slotId: slotIds[2],
        })
        .expect(200);
      const sessionId = (booked.body as SessionResponse).id;

      await request(server())
        .get(`/sessions/${sessionId}/room`)
        .set('Cookie', playerCookie)
        .expect(409);
    });
  });

  describe('session list surfacing', () => {
    it('exposes the join window on paid online sessions', async () => {
      const sessionId = await bookAndPay('consultation', 3);
      const res = await request(server())
        .get('/sessions')
        .set('Cookie', playerCookie)
        .expect(200);
      const list = res.body as SessionListResponse;
      const entry = list.upcoming.find(
        (s) => s.id === sessionId,
      ) as SessionResponse;
      expect(entry.room).not.toBeNull();
      expect(new Date(entry.room!.opensAt).getTime()).toBeLessThan(
        new Date(entry.startsAt).getTime(),
      );
      expect(entry.venue).toBeNull();
    });
  });
});
