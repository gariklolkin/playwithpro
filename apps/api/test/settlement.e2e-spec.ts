/* eslint-disable @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/no-unsafe-return
   -- supertest responses are untyped; assertions cast where it matters. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AdminDisputeListResponse,
  Role,
  SessionResponse,
} from '@playwithpro/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/auth/token.service';
import { SessionProgressionService } from '../src/bookings/session-progression.service';
import { SettlementService } from '../src/bookings/settlement.service';
import { PrismaService } from '../src/prisma/prisma.service';

const HOUR = 3_600_000;
const MINUTE = 60_000;

// Most tests here run a book→pay round-trip whose invite email goes through
// real SMTP; 5 s flakes when Mailpit queues behind the other suites.
jest.setTimeout(20_000);

/** See session-rooms.e2e-spec.ts: retry TRUNCATE past startup-sweep locks. */
async function truncateAll(prisma: PrismaService): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "User", "AvailabilitySlot", "Session", "Payment", "Video", "SessionAttendance", "Dispute" CASCADE',
      );
      return;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/**
 * Confirmation, auto-confirm payouts, disputes, and pre-start cancellation
 * against a real Postgres (CI service container or a dedicated local *e2e*
 * database). Money movement is asserted through payment audit statuses —
 * the mock provider's release/refund log is the only "bank".
 */
describe('Confirmation, payouts & disputes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let progression: SessionProgressionService;
  let settlement: SettlementService;
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

  /** Books the next free slot and pays it into escrow. */
  async function bookAndPay(serviceType = 'consultation'): Promise<string> {
    const slotId = slotIds[nextSlot++];
    const booked = await request(server())
      .post('/bookings')
      .set('Cookie', playerCookie)
      .send({ proId: coachProfileId, serviceType, slotId })
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

  /** Paid session already past its end: awaiting confirmation after read. */
  async function paidEndedSession(): Promise<string> {
    const sessionId = await bookAndPay();
    await setSessionTimes(
      sessionId,
      new Date(Date.now() - 2 * HOUR),
      new Date(Date.now() - HOUR),
    );
    return sessionId;
  }

  async function paymentStatusOf(sessionId: string): Promise<string> {
    const payment = await prisma.payment.findFirstOrThrow({
      where: { sessionId, status: { not: 'FAILED' } },
    });
    return payment.status;
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
    progression = app.get(SessionProgressionService);
    settlement = app.get(SettlementService);
    await truncateAll(prisma);

    const coach = await prisma.user.create({
      data: {
        email: 'settle-coach@e2e.test',
        role: 'PROFESSIONAL',
        displayName: 'Settle Coach',
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

    for (let i = 0; i < 10; i++) {
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
        email: 'settle-player@e2e.test',
        role: 'AMATEUR',
        displayName: 'Settle Player',
      },
    });
    const rival = await prisma.user.create({
      data: {
        email: 'settle-rival@e2e.test',
        role: 'AMATEUR',
        displayName: 'Settle Rival',
      },
    });
    const admin = await prisma.user.create({
      data: {
        email: 'settle-admin@e2e.test',
        role: 'ADMIN',
        displayName: 'Settle Admin',
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

  const server = () => app.getHttpServer();

  describe('player confirmation releases escrow', () => {
    let sessionId: string;

    it('coach confirmation is evidence only — money stays held', async () => {
      sessionId = await paidEndedSession();

      const res = await request(server())
        .post(`/sessions/${sessionId}/confirm`)
        .set('Cookie', coachCookie)
        .expect(200);
      const session = res.body as SessionResponse;
      expect(session.status).toBe('awaiting_confirmation');
      expect(session.coachConfirmedAt).toBeTruthy();
      expect(session.autoConfirmAt).toBeTruthy();
      expect(await paymentStatusOf(sessionId)).toBe('HELD');
    });

    it('player confirmation completes and pays out', async () => {
      const res = await request(server())
        .post(`/sessions/${sessionId}/confirm`)
        .set('Cookie', playerCookie)
        .expect(200);
      const session = res.body as SessionResponse;
      expect(session.status).toBe('completed_paid');
      expect(session.playerConfirmedAt).toBeTruthy();
      expect(session.escrow).toBe('released');
      expect(await paymentStatusOf(sessionId)).toBe('RELEASED');
    });

    it('repeating the confirmation is a no-op', async () => {
      const res = await request(server())
        .post(`/sessions/${sessionId}/confirm`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect((res.body as SessionResponse).status).toBe('completed_paid');
      expect(await paymentStatusOf(sessionId)).toBe('RELEASED');
    });

    it('third party confirmation yields not-found', async () => {
      const other = await paidEndedSession();
      await request(server())
        .post(`/sessions/${other}/confirm`)
        .set('Cookie', rivalCookie)
        .expect(404);
    });

    it('confirming an upcoming paid session conflicts', async () => {
      const upcoming = await bookAndPay();
      await request(server())
        .post(`/sessions/${upcoming}/confirm`)
        .set('Cookie', playerCookie)
        .expect(409);
    });
  });

  describe('auto-confirm window', () => {
    it('sweep completes and pays out an overdue unconfirmed session', async () => {
      const sessionId = await bookAndPay();
      await setSessionTimes(
        sessionId,
        new Date(Date.now() - 50 * HOUR),
        new Date(Date.now() - 49 * HOUR),
      );

      await progression.sweep();

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.status).toBe('COMPLETED_PAID');
      // Auto-confirm is the clock, not the player.
      expect(session.playerConfirmedAt).toBeNull();
      expect(await paymentStatusOf(sessionId)).toBe('RELEASED');
    });

    it('read path normalizes past the window without settling; sweep settles', async () => {
      const sessionId = await bookAndPay();
      await setSessionTimes(
        sessionId,
        new Date(Date.now() - 50 * HOUR),
        new Date(Date.now() - 49 * HOUR),
      );

      const res = await request(server())
        .get(`/sessions/${sessionId}`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect((res.body as SessionResponse).status).toBe('completed_paid');
      expect(await paymentStatusOf(sessionId)).toBe('HELD');

      await settlement.sweep();
      expect(await paymentStatusOf(sessionId)).toBe('RELEASED');
    });
  });

  describe('disputes', () => {
    let sessionId: string;

    it('validates the reason and the caller', async () => {
      sessionId = await paidEndedSession();

      await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', playerCookie)
        .send({ reason: '' })
        .expect(400);
      await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', rivalCookie)
        .send({ reason: 'not my session' })
        .expect(404);
      await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', coachCookie)
        .send({ reason: 'coaches cannot dispute' })
        .expect(403);
    });

    it('player opens the dispute and freezes the payout', async () => {
      const res = await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', playerCookie)
        .send({ reason: 'Coach never showed up' })
        .expect(200);
      const session = res.body as SessionResponse;
      expect(session.status).toBe('disputed');
      expect(session.dispute).toMatchObject({
        status: 'open',
        reason: 'Coach never showed up',
      });
      expect(await paymentStatusOf(sessionId)).toBe('HELD');
    });

    it('a second dispute conflicts', async () => {
      await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', playerCookie)
        .send({ reason: 'again' })
        .expect(409);
    });

    it('the auto-confirm clock never touches a disputed session', async () => {
      await setSessionTimes(
        sessionId,
        new Date(Date.now() - 60 * HOUR),
        new Date(Date.now() - 59 * HOUR),
      );

      await progression.sweep();
      await settlement.sweep();

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.status).toBe('DISPUTED');
      expect(await paymentStatusOf(sessionId)).toBe('HELD');
    });

    it('admin queue lists the dispute with evidence; non-admins are denied', async () => {
      await request(server())
        .get('/admin/disputes')
        .set('Cookie', playerCookie)
        .expect(403);

      const res = await request(server())
        .get('/admin/disputes')
        .set('Cookie', adminCookie)
        .expect(200);
      const list = res.body as AdminDisputeListResponse;
      const item = list.open.find((d) => d.sessionId === sessionId);
      expect(item).toMatchObject({
        reason: 'Coach never showed up',
        amountMinor: 4005,
        currency: 'EUR',
        player: expect.objectContaining({ displayName: 'Settle Player' }),
        coach: expect.objectContaining({ displayName: 'Settle Coach' }),
      });
    });

    it("resolution in the coach's favor releases the payout", async () => {
      const list = await request(server())
        .get('/admin/disputes')
        .set('Cookie', adminCookie)
        .expect(200);
      const disputeId = (list.body as AdminDisputeListResponse).open.find(
        (d) => d.sessionId === sessionId,
      )!.id;

      await request(server())
        .post(`/admin/disputes/${disputeId}/resolve`)
        .set('Cookie', playerCookie)
        .send({ outcome: 'release' })
        .expect(403);

      const res = await request(server())
        .post(`/admin/disputes/${disputeId}/resolve`)
        .set('Cookie', adminCookie)
        .send({ outcome: 'release', note: 'Attendance log shows the coach' })
        .expect(200);
      expect(res.body.outcome).toBe('release');

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.status).toBe('RESOLVED');
      expect(await paymentStatusOf(sessionId)).toBe('RELEASED');

      await request(server())
        .post(`/admin/disputes/${disputeId}/resolve`)
        .set('Cookie', adminCookie)
        .send({ outcome: 'refund' })
        .expect(409);
      expect(await paymentStatusOf(sessionId)).toBe('RELEASED');
    });

    it("resolution in the player's favor refunds", async () => {
      const disputed = await paidEndedSession();
      await request(server())
        .post(`/sessions/${disputed}/dispute`)
        .set('Cookie', playerCookie)
        .send({ reason: 'Call dropped halfway' })
        .expect(200);
      const list = await request(server())
        .get('/admin/disputes')
        .set('Cookie', adminCookie)
        .expect(200);
      const disputeId = (list.body as AdminDisputeListResponse).open.find(
        (d) => d.sessionId === disputed,
      )!.id;

      await request(server())
        .post(`/admin/disputes/${disputeId}/resolve`)
        .set('Cookie', adminCookie)
        .send({ outcome: 'refund' })
        .expect(200);

      expect(await paymentStatusOf(disputed)).toBe('REFUNDED');
      const detail = await request(server())
        .get(`/sessions/${disputed}`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect((detail.body as SessionResponse).dispute).toMatchObject({
        status: 'resolved',
        outcome: 'refund',
      });
    });
  });

  describe('pre-start cancellation', () => {
    it('either party cancels a future paid session: refund + reopened slot', async () => {
      const sessionId = await bookAndPay();
      const before = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(before.inviteSentAt).toBeTruthy();

      const res = await request(server())
        .post(`/sessions/${sessionId}/cancel`)
        .set('Cookie', coachCookie)
        .expect(200);
      const session = res.body as SessionResponse;
      expect(session.status).toBe('cancelled');
      expect(session.escrow).toBe('refunded');
      expect(await paymentStatusOf(sessionId)).toBe('REFUNDED');

      const slot = await prisma.availabilitySlot.findUniqueOrThrow({
        where: { id: before.slotId },
      });
      expect(slot.status).toBe('OPEN');
    });

    it('cancellation after start conflicts and moves nothing', async () => {
      const sessionId = await bookAndPay();
      await setSessionTimes(
        sessionId,
        new Date(Date.now() - 5 * MINUTE),
        new Date(Date.now() + 55 * MINUTE),
      );

      await request(server())
        .post(`/sessions/${sessionId}/cancel`)
        .set('Cookie', playerCookie)
        .expect(409);
      expect(await paymentStatusOf(sessionId)).toBe('HELD');
    });

    it('third-party cancellation yields not-found', async () => {
      const sessionId = await bookAndPay();
      await request(server())
        .post(`/sessions/${sessionId}/cancel`)
        .set('Cookie', rivalCookie)
        .expect(404);
    });
  });
});
