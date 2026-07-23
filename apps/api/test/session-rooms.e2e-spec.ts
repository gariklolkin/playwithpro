/* eslint-disable @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/no-unsafe-return
   -- supertest responses are untyped; assertions cast where it matters. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Role,
  SessionListResponse,
  SessionResponse,
  SessionRoomResponse,
} from '@playwithpro/shared';
import cookieParser from 'cookie-parser';
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
  let app: INestApplication;
  let prisma: PrismaService;
  let playerCookie: string;
  let rivalCookie: string;
  let coachCookie: string;

  let coachProfileId: string;
  let playerId: string;

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

    const tokens = app.get(TokenService);
    playerCookie = `access_token=${tokens.signAccessToken(playerId, Role.Amateur)}`;
    rivalCookie = `access_token=${tokens.signAccessToken(rival.id, Role.Amateur)}`;
    coachCookie = `access_token=${tokens.signAccessToken(coach.id, Role.Professional)}`;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

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
      expect(room.room).toMatchObject({
        kind: 'embedded_jitsi',
        roomName: expect.stringContaining('playwithpro-') as string,
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

      const rows = await prisma.sessionAttendance.findMany({
        where: { sessionId, userId: playerId },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.leftAt === null)).toBe(true);

      await request(server())
        .post(`/sessions/${sessionId}/room/leave`)
        .set('Cookie', playerCookie)
        .send({ attendanceId: rejoin.body.attendanceId })
        .expect(204);
      const left = await prisma.sessionAttendance.findUniqueOrThrow({
        where: { id: rejoin.body.attendanceId },
      });
      expect(left.leftAt).not.toBeNull();
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
