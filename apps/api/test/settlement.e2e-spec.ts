/* eslint-disable @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/no-unsafe-return
   -- supertest responses are untyped; assertions cast where it matters. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AdminDisputeListResponse,
  AdminPaymentListResponse,
  AdminUserDetail,
  AdminUserListResponse,
  Role,
  SessionResponse,
} from '@playwithpro/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/auth/token.service';
import { NotificationDispatchService } from '../src/notifications/notification-dispatch.service';
import { signUnsubscribeToken } from '../src/notifications/unsubscribe-token';
import { ANALYTICS, type Analytics } from '../src/observability/observability';
import { SessionProgressionService } from '../src/bookings/session-progression.service';
import { SettlementService } from '../src/bookings/settlement.service';
import { NoShowService } from '../src/disputes/no-show.service';
import { ReschedulesService } from '../src/bookings/reschedules.service';
import { NotificationScanService } from '../src/notifications/notification-scan.service';
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
  /** The no-op analytics provider (no key in tests), spied to count lifecycle events. */
  let track: jest.SpyInstance;
  let dispatcher: NotificationDispatchService;
  let noShow: NoShowService;
  let reschedules: ReschedulesService;
  let scan: NotificationScanService;
  let playerId: string;
  let coachUserId: string;
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
    // A session moved into the past is one both parties attended: stamped as
    // the no-show sweep would have classified it, so the background cron
    // never turns it into a system dispute mid-test.
    const held = endsAt.getTime() < Date.now();
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        startsAt,
        endsAt,
        ...(held
          ? { attendanceOutcome: 'HELD' as const, classifiedAt: new Date() }
          : {}),
      },
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

  /** Outbox rows of a session, oldest first. */
  async function outboxOf(sessionId: string) {
    const rows = await prisma.notification.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      include: { recipient: { select: { role: true } } },
    });
    return rows.map((row) => ({
      kind: row.kind,
      role: row.recipient.role,
      status: row.status,
      payload: row.payload,
    }));
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
    track = jest.spyOn(app.get<Analytics>(ANALYTICS), 'track');
    dispatcher = app.get(NotificationDispatchService);
    noShow = app.get(NoShowService);
    reschedules = app.get(ReschedulesService);
    scan = app.get(NotificationScanService);
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
                {
                  type: 'GAME',
                  priceMinor: 6000,
                  currency: 'EUR',
                  venueLabel: 'TT Club, Berlin',
                },
              ],
            },
          },
        },
      },
      include: { proProfile: true },
    });
    coachProfileId = coach.proProfile!.id;

    for (let i = 0; i < 110; i++) {
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

    playerId = player.id;
    coachUserId = coach.id;

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
      track.mockClear();
      const res = await request(server())
        .post(`/sessions/${sessionId}/confirm`)
        .set('Cookie', playerCookie)
        .expect(200);
      const session = res.body as SessionResponse;
      expect(session.status).toBe('completed_paid');
      expect(session.playerConfirmedAt).toBeTruthy();
      expect(session.escrow).toBe('released');
      expect(await paymentStatusOf(sessionId)).toBe('RELEASED');
      // Exactly one money event per transition, keyed by the payer, no free text.
      const completed = track.mock.calls.filter(
        ([input]) => (input as { event: string }).event === 'session_completed',
      );
      expect(completed).toHaveLength(1);
      // Outbox: receipt + new-booking at pay, completion rows follow the
      // release — exactly one of each.
      const kinds = (await outboxOf(sessionId)).map(
        (r) => `${r.kind}:${r.role}`,
      );
      expect(kinds.filter((k) => k.startsWith('SESSION_PAID_'))).toEqual([
        'SESSION_PAID_PLAYER:AMATEUR',
        'SESSION_PAID_COACH:PROFESSIONAL',
      ]);
      expect(kinds.filter((k) => k.startsWith('SESSION_COMPLETED_'))).toEqual([
        'SESSION_COMPLETED_PLAYER:AMATEUR',
        'SESSION_COMPLETED_COACH:PROFESSIONAL',
      ]);
      expect(completed[0][0]).toMatchObject({
        distinctId: expect.any(String) as string,
        properties: {
          sessionId,
          serviceType: 'consultation',
          amountMinor: 4005,
          currency: 'EUR',
        },
      });
    });

    it('a settlement retry never emits the money event twice', async () => {
      track.mockClear();
      await settlement.settle(sessionId);
      await settlement.sweep();
      expect(
        track.mock.calls.filter(
          ([input]) =>
            (input as { event: string }).event === 'session_completed',
        ),
      ).toHaveLength(0);
      expect(
        (await outboxOf(sessionId)).filter((r) =>
          r.kind.startsWith('SESSION_COMPLETED_'),
        ),
      ).toHaveLength(2);
    });

    it('dispatch with SMTP unreachable leaves rows pending with a backoff; money untouched', async () => {
      const handled = await dispatcher.dispatchOnce();
      expect(handled).toBeGreaterThan(0);
      const rows = await prisma.notification.findMany({ where: { sessionId } });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(['PENDING', 'SKIPPED']).toContain(row.status);
        if (row.status === 'PENDING' && row.attempts > 0) {
          expect(row.lastError).toBeTruthy();
          expect(row.dueAt.getTime()).toBeGreaterThan(Date.now());
        }
      }
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
        .send({ category: 'other', reason: '' })
        .expect(400);
      await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', rivalCookie)
        .send({ category: 'other', reason: 'not my session' })
        .expect(404);
      await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', coachCookie)
        .send({ category: 'other', reason: 'coaches cannot dispute' })
        .expect(403);
    });

    it('player opens the dispute and freezes the payout', async () => {
      track.mockClear();
      const res = await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', playerCookie)
        .send({ category: 'coach_no_show', reason: 'Coach never showed up' })
        .expect(200);
      const session = res.body as SessionResponse;
      expect(session.status).toBe('disputed');
      expect(session.dispute).toMatchObject({
        status: 'open',
        kind: 'player_reported',
        reasonCategory: 'coach_no_show',
        reason: 'Coach never showed up',
      });
      expect(await paymentStatusOf(sessionId)).toBe('HELD');
      // One event, and the free-text reason never leaves the platform.
      const disputed = track.mock.calls.filter(
        ([input]) => (input as { event: string }).event === 'session_disputed',
      );
      expect(disputed).toHaveLength(1);
      expect(JSON.stringify(disputed[0][0])).not.toContain('Coach never');
      const opened = (await outboxOf(sessionId)).filter((r) =>
        r.kind.startsWith('DISPUTE_OPENED_'),
      );
      expect(opened.map((r) => `${r.kind}:${r.role}`)).toEqual([
        'DISPUTE_OPENED_PLAYER:AMATEUR',
        'DISPUTE_OPENED_COACH:PROFESSIONAL',
        'DISPUTE_OPENED_ADMIN:ADMIN',
      ]);
      expect(JSON.stringify(opened)).not.toContain('Coach never');
    });

    it('a second dispute conflicts', async () => {
      await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', playerCookie)
        .send({ category: 'other', reason: 'again' })
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
        .send({ category: 'technical_problem' })
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

  describe('no-show protection', () => {
    const DAY = 24 * HOUR;

    /**
     * An online session that ended an hour ago (join window closed), not yet
     * classified, with the given evidence. `connected` = joined and reported
     * connected for the first half hour; `joined` = pressed join only.
     */
    async function endedSession(evidence: {
      player?: 'connected' | 'joined';
      coach?: 'connected' | 'joined';
    }): Promise<string> {
      const sessionId = await bookAndPay();
      const startsAt = new Date(Date.now() - 2 * HOUR);
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          startsAt,
          endsAt: new Date(Date.now() - HOUR),
          status: 'AWAITING_CONFIRMATION',
        },
      });
      const rows = [
        { userId: playerId, how: evidence.player },
        { userId: coachUserId, how: evidence.coach },
      ].filter((row) => row.how !== undefined);
      for (const row of rows) {
        await prisma.sessionAttendance.create({
          data: {
            sessionId,
            userId: row.userId,
            joinedAt: startsAt,
            connectedAt: row.how === 'connected' ? startsAt : null,
            leftAt:
              row.how === 'connected'
                ? new Date(startsAt.getTime() + 30 * MINUTE)
                : null,
          },
        });
      }
      return sessionId;
    }

    const stateOf = async (sessionId: string) => {
      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
        include: { dispute: true },
      });
      return {
        status: session.status,
        outcome: session.attendanceOutcome,
        dispute: session.dispute,
        payment: await paymentStatusOf(sessionId),
      };
    };

    /** The sweep as it would run once the coach's response window is over. */
    const afterResponseWindow = () =>
      noShow.sweepOnce(new Date(Date.now() + 49 * HOUR));

    it('coach no-show: system dispute, then an automatic refund exactly once', async () => {
      const sessionId = await endedSession({ player: 'connected' });
      await noShow.sweepOnce();

      let state = await stateOf(sessionId);
      expect(state).toMatchObject({
        status: 'DISPUTED',
        outcome: 'COACH_NO_SHOW',
        payment: 'HELD',
      });
      expect(state.dispute).toMatchObject({
        kind: 'COACH_NO_SHOW',
        openedById: null,
        status: 'OPEN',
      });
      const dueIn = state.dispute!.responseDueAt!.getTime() - Date.now();
      expect(dueIn).toBeGreaterThan(47 * HOUR);
      expect(dueIn).toBeLessThanOrEqual(48 * HOUR);
      // Both parties and the admin hear about it — through the existing kinds.
      expect(
        (await outboxOf(sessionId))
          .filter((r) => r.kind.startsWith('DISPUTE_OPENED_'))
          .map((r) => `${r.kind}:${r.role}`),
      ).toEqual([
        'DISPUTE_OPENED_PLAYER:AMATEUR',
        'DISPUTE_OPENED_COACH:PROFESSIONAL',
        'DISPUTE_OPENED_ADMIN:ADMIN',
      ]);

      // The player sees what happened and when the refund lands.
      const seen = (
        await request(server())
          .get(`/sessions/${sessionId}`)
          .set('Cookie', playerCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(seen.attendance).toMatchObject({
        outcome: 'coach_no_show',
        coachFirstConnectedAt: null,
        overlapMinutes: 0,
      });
      expect(seen.attendance!.playerFirstConnectedAt).not.toBeNull();
      expect(seen.dispute).toMatchObject({
        kind: 'coach_no_show',
        reason: null,
      });
      expect(seen.dispute!.responseDueAt).not.toBeNull();

      // Before the deadline nothing moves.
      await noShow.sweepOnce();
      expect((await stateOf(sessionId)).payment).toBe('HELD');

      await afterResponseWindow();
      await afterResponseWindow();
      state = await stateOf(sessionId);
      expect(state).toMatchObject({ status: 'RESOLVED', payment: 'REFUNDED' });
      expect(state.dispute).toMatchObject({
        status: 'RESOLVED',
        outcome: 'REFUND',
        resolvedById: null,
        resolvedVia: 'SYSTEM',
        systemNoteCode: 'NO_COACH_RESPONSE',
      });
      expect(
        (await outboxOf(sessionId)).filter((r) =>
          r.kind.startsWith('DISPUTE_RESOLVED_'),
        ),
      ).toHaveLength(2);
    });

    it('a coach response keeps the dispute open for an admin; no money moves', async () => {
      const sessionId = await endedSession({ player: 'connected' });
      await noShow.sweepOnce();

      await request(server())
        .post(`/sessions/${sessionId}/dispute/response`)
        .set('Cookie', playerCookie)
        .send({ statement: 'I am the player, this is not mine to send.' })
        .expect(403);
      await request(server())
        .post(`/sessions/${sessionId}/dispute/response`)
        .set('Cookie', coachCookie)
        .send({ statement: 'too short' })
        .expect(400);
      const res = await request(server())
        .post(`/sessions/${sessionId}/dispute/response`)
        .set('Cookie', coachCookie)
        .send({ statement: 'The call failed, we met on another app instead.' })
        .expect(200);
      expect((res.body as SessionResponse).dispute).toMatchObject({
        coachResponse: 'The call failed, we met on another app instead.',
        responseDueAt: null,
      });
      await request(server())
        .post(`/sessions/${sessionId}/dispute/response`)
        .set('Cookie', coachCookie)
        .send({ statement: 'A second statement is not accepted at all.' })
        .expect(409);

      await afterResponseWindow();
      expect(await stateOf(sessionId)).toMatchObject({
        status: 'DISPUTED',
        payment: 'HELD',
      });

      // The admin sees the contested case, filtered by kind, and decides.
      const list = (
        await request(server())
          .get('/admin/disputes?kind=coach_no_show')
          .set('Cookie', adminCookie)
          .expect(200)
      ).body as AdminDisputeListResponse;
      expect(new Set(list.open.map((d) => String(d.kind)))).toEqual(
        new Set(['coach_no_show']),
      );
      const item = list.open.find((d) => d.sessionId === sessionId)!;
      expect(item).toMatchObject({
        coachResponse: 'The call failed, we met on another app instead.',
        responseDueAt: null,
        // The refunded no-show of the previous test counts against the coach.
        coachPreviousNoShows: 1,
      });
      expect(item.attendanceSummary).toMatchObject({
        outcome: 'coach_no_show',
      });
      await request(server())
        .get('/admin/disputes?kind=nonsense')
        .set('Cookie', adminCookie)
        .expect(400);

      await request(server())
        .post(`/admin/disputes/${item.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({ outcome: 'release' })
        .expect(200);
      expect(await stateOf(sessionId)).toMatchObject({
        status: 'RESOLVED',
        payment: 'RELEASED',
      });
    });

    it('player no-show: no dispute, the coach is paid at auto-confirm', async () => {
      const sessionId = await endedSession({ coach: 'connected' });
      await noShow.sweepOnce();
      expect(await stateOf(sessionId)).toMatchObject({
        status: 'AWAITING_CONFIRMATION',
        outcome: 'PLAYER_NO_SHOW',
        dispute: null,
      });

      await prisma.session.update({
        where: { id: sessionId },
        data: {
          startsAt: new Date(Date.now() - 50 * HOUR),
          endsAt: new Date(Date.now() - 49 * HOUR),
        },
      });
      await progression.sweep();
      expect(await stateOf(sessionId)).toMatchObject({
        status: 'COMPLETED_PAID',
        payment: 'RELEASED',
      });
    });

    it("both connected: held, today's flow unchanged", async () => {
      const sessionId = await endedSession({
        player: 'connected',
        coach: 'connected',
      });
      await noShow.sweepOnce();
      expect(await stateOf(sessionId)).toMatchObject({
        status: 'AWAITING_CONFIRMATION',
        outcome: 'HELD',
        dispute: null,
        payment: 'HELD',
      });
    });

    it('nobody came: NO_ATTENDANCE dispute, refunded without a response', async () => {
      const sessionId = await endedSession({});
      await noShow.sweepOnce();
      expect((await stateOf(sessionId)).dispute).toMatchObject({
        kind: 'NO_ATTENDANCE',
      });

      await afterResponseWindow();
      expect(await stateOf(sessionId)).toMatchObject({
        status: 'RESOLVED',
        payment: 'REFUNDED',
      });
    });

    it('evidence gap: the coach pressed join, no connection reported — waits for an admin', async () => {
      const sessionId = await endedSession({
        player: 'connected',
        coach: 'joined',
      });
      await noShow.sweepOnce();
      const state = await stateOf(sessionId);
      expect(state.dispute).toMatchObject({
        kind: 'EVIDENCE_GAP',
        responseDueAt: null,
      });

      await afterResponseWindow();
      expect(await stateOf(sessionId)).toMatchObject({
        status: 'DISPUTED',
        payment: 'HELD',
      });
    });

    it('player confirmation wins: it withdraws a system dispute and releases', async () => {
      const sessionId = await endedSession({ player: 'connected' });
      await noShow.sweepOnce();

      // The player cannot stack their own dispute on top of the system's.
      await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', playerCookie)
        .send({ category: 'coach_no_show' })
        .expect(409);

      const res = await request(server())
        .post(`/sessions/${sessionId}/confirm`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect((res.body as SessionResponse).status).toBe('resolved');
      const state = await stateOf(sessionId);
      expect(state).toMatchObject({ status: 'RESOLVED', payment: 'RELEASED' });
      expect(state.dispute).toMatchObject({
        outcome: 'RELEASE',
        resolvedVia: 'PLAYER_CONFIRMATION',
      });

      // The deadline that would have refunded finds nothing to do.
      await afterResponseWindow();
      expect((await stateOf(sessionId)).payment).toBe('RELEASED');
    });

    it('player confirmation wins over a player no-show classification too', async () => {
      const sessionId = await endedSession({ coach: 'connected' });
      await noShow.sweepOnce();
      await request(server())
        .post(`/sessions/${sessionId}/confirm`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect(await stateOf(sessionId)).toMatchObject({
        status: 'COMPLETED_PAID',
        payment: 'RELEASED',
      });
    });

    it('a player-reported dispute is never withdrawn by confirming', async () => {
      const sessionId = await paidEndedSession();
      await request(server())
        .post(`/sessions/${sessionId}/dispute`)
        .set('Cookie', playerCookie)
        .send({ category: 'technical_problem' })
        .expect(200);
      await request(server())
        .post(`/sessions/${sessionId}/confirm`)
        .set('Cookie', playerCookie)
        .expect(409);
      expect((await stateOf(sessionId)).payment).toBe('HELD');
    });

    it('classification runs once: late evidence changes nothing', async () => {
      const sessionId = await endedSession({ player: 'connected' });
      await noShow.sweepOnce();
      const before = await stateOf(sessionId);

      // A connection report for the coach arrives after the decision.
      await prisma.sessionAttendance.create({
        data: {
          sessionId,
          userId: coachUserId,
          joinedAt: new Date(Date.now() - 2 * HOUR),
          connectedAt: new Date(Date.now() - 2 * HOUR),
        },
      });
      await noShow.sweepOnce();

      const after = await stateOf(sessionId);
      expect(after.outcome).toBe('COACH_NO_SHOW');
      expect(after.dispute!.id).toBe(before.dispute!.id);
      expect(await prisma.dispute.count({ where: { sessionId } })).toBe(1);
    });

    it('an unclassified online session never auto-confirms on its own', async () => {
      const sessionId = await endedSession({ player: 'connected' });
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          startsAt: new Date(Date.now() - 50 * HOUR),
          endsAt: new Date(Date.now() - 49 * HOUR),
        },
      });
      await progression.sweep();
      expect(await stateOf(sessionId)).toMatchObject({
        status: 'AWAITING_CONFIRMATION',
        payment: 'HELD',
      });
    });

    describe('in-person games', () => {
      async function endedGame(hoursAgo: number): Promise<string> {
        const sessionId = await bookAndPay('game');
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            startsAt: new Date(Date.now() - (hoursAgo + 1) * HOUR),
            endsAt: new Date(Date.now() - hoursAgo * HOUR),
            status: 'AWAITING_CONFIRMATION',
          },
        });
        return sessionId;
      }

      it('the coach must answer; an answered game pays out at auto-confirm', async () => {
        const sessionId = await endedGame(49);
        await request(server())
          .post(`/sessions/${sessionId}/confirm`)
          .set('Cookie', coachCookie)
          .send({})
          .expect(400);

        // Silent coach: the deadline passes and nothing is paid.
        await progression.sweep();
        await noShow.sweepOnce();
        expect(await stateOf(sessionId)).toMatchObject({
          status: 'AWAITING_CONFIRMATION',
          outcome: null,
          dispute: null,
          payment: 'HELD',
        });
        const silent = (
          await request(server())
            .get(`/sessions/${sessionId}`)
            .set('Cookie', coachCookie)
            .expect(200)
        ).body as SessionResponse;
        expect(silent.autoConfirmAt).toBeNull();
        expect(silent.attendance).toBeNull();

        const res = await request(server())
          .post(`/sessions/${sessionId}/confirm`)
          .set('Cookie', coachCookie)
          .send({ gameAnswer: 'player_absent' })
          .expect(200);
        expect((res.body as SessionResponse).coachGameAnswer).toBe(
          'player_absent',
        );
        await progression.sweep();
        expect(await stateOf(sessionId)).toMatchObject({
          status: 'COMPLETED_PAID',
          payment: 'RELEASED',
        });
      });

      it('an online coach cannot send a game answer', async () => {
        const sessionId = await paidEndedSession();
        await request(server())
          .post(`/sessions/${sessionId}/confirm`)
          .set('Cookie', coachCookie)
          .send({ gameAnswer: 'took_place' })
          .expect(400);
      });

      it('seven days of silence: an admin dispute that never resolves itself', async () => {
        const sessionId = await endedGame(7 * 24 + 1);
        await noShow.sweepOnce();
        const state = await stateOf(sessionId);
        expect(state).toMatchObject({ status: 'DISPUTED', payment: 'HELD' });
        expect(state.dispute).toMatchObject({
          kind: 'NO_ATTENDANCE',
          responseDueAt: null,
        });

        await noShow.sweepOnce(new Date(Date.now() + 30 * DAY));
        expect(await stateOf(sessionId)).toMatchObject({
          status: 'DISPUTED',
          payment: 'HELD',
        });
      });
    });
  });

  describe('email preferences', () => {
    it('reads and updates the optional categories, and the one-click link turns one off', async () => {
      const initial = await request(server())
        .get('/users/me/notifications')
        .set('Cookie', coachCookie)
        .expect(200);
      expect(initial.body).toEqual({
        emailReminders: true,
        emailClipChanges: true,
        emailReviews: true,
      });

      const updated = await request(server())
        .patch('/users/me/notifications')
        .set('Cookie', coachCookie)
        .send({ emailClipChanges: false })
        .expect(200);
      expect(updated.body.emailClipChanges).toBe(false);

      const coach = await prisma.user.findFirstOrThrow({
        where: { email: 'settle-coach@e2e.test' },
      });
      const token = signUnsubscribeToken(
        process.env.NOTIFY_UNSUBSCRIBE_SECRET ?? 'dev-only-unsubscribe-secret',
        { userId: coach.id, category: 'emailReminders' },
      );
      const off = await request(server())
        .post('/notifications/unsubscribe')
        .send({ token })
        .expect(200);
      expect(off.body).toEqual({ category: 'emailReminders' });
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: coach.id },
      });
      expect(after.emailReminders).toBe(false);
      expect(after.emailReviews).toBe(true);

      await request(server())
        .post('/notifications/unsubscribe')
        .send({ token: `${token}x` })
        .expect(400);
    });
  });

  describe('cancellation policy', () => {
    /**
     * A paid session starting `hours` from now, paid `paidMinutesAgo` ago
     * (long enough by default that the late-booking grace is over).
     */
    async function paidSessionStarting(
      hours: number,
      paidMinutesAgo = 120,
    ): Promise<string> {
      const sessionId = await bookAndPay();
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          startsAt: new Date(Date.now() + hours * HOUR),
          endsAt: new Date(Date.now() + (hours + 1) * HOUR),
          paidAt: new Date(Date.now() - paidMinutesAgo * MINUTE),
        },
      });
      return sessionId;
    }

    const cancelAs = (cookie: string, sessionId: string) =>
      request(server())
        .post(`/sessions/${sessionId}/cancel`)
        .set('Cookie', cookie);

    /** The original start time has come: what the sweep does then. */
    async function reachStart(sessionId: string): Promise<void> {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          startsAt: new Date(Date.now() - MINUTE),
          endsAt: new Date(Date.now() + 59 * MINUTE),
        },
      });
      await settlement.sweep();
    }

    const paymentOf = (sessionId: string) =>
      prisma.payment.findFirstOrThrow({
        where: { sessionId, status: { not: 'FAILED' } },
      });

    it('snapshots the platform policy at booking and shows it before payment', async () => {
      const slotId = slotIds[nextSlot++];
      const booked = (
        await request(server())
          .post('/bookings')
          .set('Cookie', playerCookie)
          .send({ proId: coachProfileId, serviceType: 'consultation', slotId })
          .expect(200)
      ).body as SessionResponse;

      const row = await prisma.session.findUniqueOrThrow({
        where: { id: booked.id },
      });
      expect(row).toMatchObject({
        cancelFreeHours: 24,
        cancelLateRefundPercent: 50,
        cancelNoRefundHours: 2,
        cancelGraceMin: 30,
        paidAt: null,
      });
      const unpaid = (
        await request(server())
          .get(`/sessions/${booked.id}`)
          .set('Cookie', playerCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(unpaid.cancellationPolicy).toMatchObject({
        freeUntil: new Date(row.startsAt.getTime() - 24 * HOUR).toISOString(),
        partialUntil: new Date(row.startsAt.getTime() - 2 * HOUR).toISOString(),
        lateRefundPercent: 50,
      });
      expect(unpaid.cancellationTerms).toBeNull();

      const policy = await request(server())
        .get('/cancellation-policy')
        .expect(200);
      expect(policy.body).toEqual({
        freeHours: 24,
        lateRefundPercent: 50,
        noRefundHours: 2,
        graceMinutes: 30,
      });

      // Releasing the unpaid booking stays free and silent.
      await cancelAs(playerCookie, booked.id).expect(200);
      const released = await prisma.session.findUniqueOrThrow({
        where: { id: booked.id },
      });
      expect(released).toMatchObject({
        status: 'CANCELLED',
        cancelledAt: null,
        cancelledBy: null,
        cancellationTier: null,
      });
      expect(await outboxOf(booked.id)).toEqual([]);
    });

    it("25 h before start: full refund right away, recorded as the player's free cancellation", async () => {
      const sessionId = await paidSessionStarting(25);
      const terms = (
        await request(server())
          .get(`/sessions/${sessionId}`)
          .set('Cookie', playerCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(terms.cancellationTerms).toMatchObject({
        tier: 'free',
        refundMinor: 4005,
      });

      const res = await cancelAs(playerCookie, sessionId).expect(200);
      const session = res.body as SessionResponse;
      expect(session.cancellation).toMatchObject({
        by: 'player',
        tier: 'free',
        refundMinor: 4005,
        coachNetMinor: 0,
        late: false,
        settled: true,
      });
      expect(session.escrow).toBe('refunded');
      const row = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
        include: { slot: true },
      });
      expect(row.slot.status).toBe('OPEN');
      expect(row.cancelledBy).toBe('PLAYER');
    });

    it('10 h before start: held until the start, then one release with half refunded', async () => {
      const sessionId = await paidSessionStarting(10);
      const before = (
        await request(server())
          .get(`/sessions/${sessionId}`)
          .set('Cookie', playerCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(before.cancellationTerms).toEqual({
        tier: 'partial',
        refundMinor: 2003,
        coachNetMinor: 1802,
        late: false,
      });

      const res = await cancelAs(playerCookie, sessionId).expect(200);
      expect((res.body as SessionResponse).cancellation).toMatchObject({
        tier: 'partial',
        refundMinor: 2003,
        coachNetMinor: 1802,
        settled: false,
      });
      expect((res.body as SessionResponse).escrow).toBe('held');

      // The sweep leaves it alone until the original start time…
      await settlement.sweep();
      expect(await paymentOf(sessionId)).toMatchObject({
        status: 'HELD',
        refundedMinor: null,
      });

      // …then moves the money once, and only once.
      await reachStart(sessionId);
      await settlement.sweep();
      expect(await paymentOf(sessionId)).toMatchObject({
        status: 'RELEASED',
        refundedMinor: 2003,
      });

      const ledger = (
        await request(server())
          .get('/admin/payments?status=released')
          .set('Cookie', adminCookie)
          .expect(200)
      ).body as AdminPaymentListResponse;
      expect(ledger.items.find((i) => i.sessionId === sessionId)).toMatchObject(
        {
          amountMinor: 4005,
          feeMinor: 401,
          refundedMinor: 2003,
          sessionStatus: 'cancelled',
          cancellation: {
            by: 'player',
            tier: 'partial',
            coachNetMinor: 1802,
            settled: true,
            reason: null,
          },
        },
      );
    });

    it('1 h before start: nothing refunded, a plain release at the start', async () => {
      const sessionId = await paidSessionStarting(1);
      const res = await cancelAs(playerCookie, sessionId).expect(200);
      expect((res.body as SessionResponse).cancellation).toMatchObject({
        tier: 'none',
        refundMinor: 0,
        coachNetMinor: 3604,
      });

      await reachStart(sessionId);
      expect(await paymentOf(sessionId)).toMatchObject({
        status: 'RELEASED',
        refundedMinor: null,
      });
    });

    it('a booking paid 5 h ahead is free to cancel for 30 minutes, then partial', async () => {
      const inGrace = await paidSessionStarting(5, 20);
      const shown = (
        await request(server())
          .get(`/sessions/${inGrace}`)
          .set('Cookie', playerCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(shown.cancellationPolicy?.graceUntil).not.toBeNull();
      const free = await cancelAs(playerCookie, inGrace).expect(200);
      expect((free.body as SessionResponse).cancellation?.tier).toBe('free');
      expect((await paymentOf(inGrace)).status).toBe('REFUNDED');

      const afterGrace = await paidSessionStarting(5, 40);
      const partial = await cancelAs(playerCookie, afterGrace).expect(200);
      expect((partial.body as SessionResponse).cancellation?.tier).toBe(
        'partial',
      );
    });

    it("the terms are the session's own snapshot, not the current config", async () => {
      const sessionId = await paidSessionStarting(10);
      // Booked back when cancellation was free until 8 hours before start.
      await prisma.session.update({
        where: { id: sessionId },
        data: { cancelFreeHours: 8 },
      });
      const res = await cancelAs(playerCookie, sessionId).expect(200);
      expect((res.body as SessionResponse).cancellation?.tier).toBe('free');
    });

    it('the coach refunds in full before the start; afterwards it is too late', async () => {
      const sessionId = await paidSessionStarting(10);
      await cancelAs(playerCookie, sessionId).expect(200);

      await request(server())
        .post(`/sessions/${sessionId}/cancellation/waive`)
        .set('Cookie', playerCookie)
        .expect(403);
      await request(server())
        .post(`/sessions/${sessionId}/cancellation/waive`)
        .set('Cookie', rivalCookie)
        .expect(404);
      const res = await request(server())
        .post(`/sessions/${sessionId}/cancellation/waive`)
        .set('Cookie', coachCookie)
        .expect(200);
      expect((res.body as SessionResponse).cancellation).toMatchObject({
        waived: true,
        refundMinor: 4005,
        coachNetMinor: 0,
        settled: true,
      });
      expect(await paymentOf(sessionId)).toMatchObject({
        status: 'REFUNDED',
        refundedMinor: null,
      });
      // Never released afterwards, and a second waiver conflicts.
      await reachStart(sessionId);
      expect((await paymentOf(sessionId)).status).toBe('REFUNDED');
      await request(server())
        .post(`/sessions/${sessionId}/cancellation/waive`)
        .set('Cookie', coachCookie)
        .expect(409);
      expect(
        (await outboxOf(sessionId))
          .filter((r) => r.kind.startsWith('CANCELLATION_FEE_WAIVED_'))
          .map((r) => r.role),
      ).toEqual(['AMATEUR', 'PROFESSIONAL']);

      const settled = await paidSessionStarting(1);
      await cancelAs(playerCookie, settled).expect(200);
      await reachStart(settled);
      await request(server())
        .post(`/sessions/${settled}/cancellation/waive`)
        .set('Cookie', coachCookie)
        .expect(409);
      expect((await paymentOf(settled)).status).toBe('RELEASED');
    });

    it('a waiver racing the start-time sweep moves the money exactly once', async () => {
      for (let round = 0; round < 4; round++) {
        const sessionId = await paidSessionStarting(10);
        await cancelAs(playerCookie, sessionId).expect(200);
        await prisma.session.update({
          where: { id: sessionId },
          data: { startsAt: new Date(Date.now() - MINUTE) },
        });

        const [waiver] = await Promise.all([
          request(server())
            .post(`/sessions/${sessionId}/cancellation/waive`)
            .set('Cookie', coachCookie),
          settlement.sweep(),
        ]);
        await settlement.sweep();

        const payment = await paymentOf(sessionId);
        const session = await prisma.session.findUniqueOrThrow({
          where: { id: sessionId },
        });
        if (waiver.status === 200) {
          // The waiver was recorded: a refund, never a release.
          expect(session.feeWaivedAt).not.toBeNull();
          expect(payment).toMatchObject({
            status: 'REFUNDED',
            refundedMinor: null,
          });
        } else {
          expect(waiver.status).toBe(409);
          expect(session.feeWaivedAt).toBeNull();
          expect(payment).toMatchObject({
            status: 'RELEASED',
            refundedMinor: 2003,
          });
        }
      }
    });

    it('a late coach cancellation refunds in full, counts, and alerts the admins at the threshold', async () => {
      const lateAlerts = () =>
        prisma.notification.count({
          where: { kind: 'COACH_LATE_CANCELLATIONS_ADMIN' },
        });
      for (let late = 1; late <= 4; late++) {
        const sessionId = await paidSessionStarting(3);
        const res = await cancelAs(coachCookie, sessionId).expect(200);
        expect((res.body as SessionResponse).cancellation).toMatchObject({
          by: 'coach',
          tier: 'free',
          refundMinor: 4005,
          late: true,
        });
        expect((await paymentOf(sessionId)).status).toBe('REFUNDED');
        // One alert per admin, exactly when the third one happens.
        expect(await lateAlerts()).toBe(late >= 3 ? 1 : 0);
      }

      const directory = (
        await request(server())
          .get('/admin/users?role=professional')
          .set('Cookie', adminCookie)
          .expect(200)
      ).body as AdminUserListResponse;
      expect(
        directory.items.find((u) => u.id === coachUserId)?.lateCancellations,
      ).toEqual({ count: 4, flagged: true });
      const detail = (
        await request(server())
          .get(`/admin/users/${coachUserId}`)
          .set('Cookie', adminCookie)
          .expect(200)
      ).body as AdminUserDetail;
      expect(detail.lateCancellations).toEqual({ count: 4, flagged: true });
      expect(
        directory.items.find((u) => u.id !== coachUserId)?.lateCancellations ??
          null,
      ).toBeNull();
    });

    it('force majeure: an admin cancels in full with a reason, and it never counts as late', async () => {
      const sessionId = await paidSessionStarting(1);
      await request(server())
        .post(`/admin/sessions/${sessionId}/cancel`)
        .set('Cookie', coachCookie)
        .send({ reason: 'I am not an admin' })
        .expect(403);
      await request(server())
        .post(`/admin/sessions/${sessionId}/cancel`)
        .set('Cookie', adminCookie)
        .send({ reason: '   ' })
        .expect(400);
      await request(server())
        .post(`/admin/sessions/${sessionId}/cancel`)
        .set('Cookie', adminCookie)
        .send({ reason: 'Venue closed by the city' })
        .expect(200);

      const row = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(row).toMatchObject({
        status: 'CANCELLED',
        cancelledBy: 'ADMIN',
        cancellationTier: 'FREE',
        cancellationRefundMinor: 4005,
        cancellationLate: false,
        cancellationReason: 'Venue closed by the city',
      });
      expect((await paymentOf(sessionId)).status).toBe('REFUNDED');
      // The parties never see the admin's reason.
      const seen = await request(server())
        .get(`/sessions/${sessionId}`)
        .set('Cookie', playerCookie)
        .expect(200);
      expect(JSON.stringify(seen.body)).not.toContain('Venue closed');
      expect((seen.body as SessionResponse).cancellation?.by).toBe('admin');
    });

    it('an admin can waive a late fee too', async () => {
      const sessionId = await paidSessionStarting(1);
      await cancelAs(playerCookie, sessionId).expect(200);
      await request(server())
        .post(`/admin/sessions/${sessionId}/cancellation/waive`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect((await paymentOf(sessionId)).status).toBe('REFUNDED');
    });
  });

  describe('rescheduling', () => {
    const DAY = 24 * HOUR;

    /** A fresh open one-hour slot of the coach, `hours` from now. */
    async function openSlot(hours: number): Promise<string> {
      const startsAt = new Date(
        Date.now() + hours * HOUR + Math.floor(Math.random() * 50) * MINUTE,
      );
      startsAt.setUTCSeconds(0, Math.floor(Math.random() * 999));
      const slot = await prisma.availabilitySlot.create({
        data: {
          profileId: coachProfileId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + HOUR),
          source: 'MANUAL',
        },
      });
      return slot.id;
    }

    /** A paid session `hours` ahead, paid long enough ago for no grace. */
    async function paidSessionStarting(hours: number): Promise<string> {
      const sessionId = await bookAndPay();
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          startsAt: new Date(Date.now() + hours * HOUR),
          endsAt: new Date(Date.now() + (hours + 1) * HOUR),
          paidAt: new Date(Date.now() - 3 * HOUR),
        },
      });
      return sessionId;
    }

    const post = (
      cookie: string,
      sessionId: string,
      path = '',
      body?: object,
    ) =>
      request(server())
        .post(`/sessions/${sessionId}/reschedule${path}`)
        .set('Cookie', cookie)
        .send(body ?? {});

    const slotStatus = async (id: string) =>
      (await prisma.availabilitySlot.findUniqueOrThrow({ where: { id } }))
        .status;

    it('player proposes two options, the coach accepts one: the session moves and nothing else does', async () => {
      const sessionId = await paidSessionStarting(72);
      const before = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      const [first, second] = [await openSlot(120), await openSlot(144)];

      const proposed = (
        await post(playerCookie, sessionId, '', {
          slotIds: [first, second],
        }).expect(200)
      ).body as SessionResponse;
      expect(proposed.reschedule).toMatchObject({
        proposedBy: 'player',
        mine: true,
      });
      expect(proposed.reschedule!.options).toHaveLength(2);
      expect(proposed.rescheduleAllowed).toBe(false);
      // Both offered slots are held: nobody else can book them.
      expect(await slotStatus(first)).toBe('BOOKED');
      expect(await slotStatus(second)).toBe('BOOKED');
      await request(server())
        .post('/bookings')
        .set('Cookie', rivalCookie)
        .send({
          proId: coachProfileId,
          serviceType: 'consultation',
          slotId: first,
        })
        .expect(409);
      // The session itself has not moved.
      expect(
        (await prisma.session.findUniqueOrThrow({ where: { id: sessionId } }))
          .startsAt,
      ).toEqual(before.startsAt);

      // The coach sees it as theirs to answer; the proposer cannot accept.
      const seenByCoach = (
        await request(server())
          .get(`/sessions/${sessionId}`)
          .set('Cookie', coachCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(seenByCoach.reschedule).toMatchObject({ mine: false });
      const chosen = seenByCoach.reschedule!.options[1];
      await post(playerCookie, sessionId, '/accept', {
        optionId: chosen.id,
      }).expect(403);
      await post(rivalCookie, sessionId, '/accept', {
        optionId: chosen.id,
      }).expect(404);

      const accepted = (
        await post(coachCookie, sessionId, '/accept', {
          optionId: chosen.id,
        }).expect(200)
      ).body as SessionResponse;
      expect(accepted.startsAt).toBe(chosen.startsAt);
      expect(accepted.endsAt).toBe(chosen.endsAt);
      expect(accepted.reschedule).toBeNull();
      expect(accepted.rescheduleCount).toBe(1);
      expect(accepted.escrow).toBe('held');

      const after = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(after.slotId).toBe(second);
      expect(after.calendarSequence).toBe(before.calendarSequence + 1);
      // Snapshots, room and money are untouched.
      expect(after).toMatchObject({
        priceMinor: before.priceMinor,
        platformFeeMinor: before.platformFeeMinor,
        roomSlug: before.roomSlug,
        cancelFreeHours: before.cancelFreeHours,
        status: 'PAID_ESCROW',
      });
      expect(await paymentStatusOf(sessionId)).toBe('HELD');
      // The other option and the old slot are back on the market.
      expect(await slotStatus(first)).toBe('OPEN');
      expect(await slotStatus(before.slotId)).toBe('OPEN');
      expect(await slotStatus(second)).toBe('BOOKED');

      const outbox = (await outboxOf(sessionId)).map(
        (r) => `${r.kind}:${r.role}`,
      );
      expect(outbox).toEqual(
        expect.arrayContaining([
          'RESCHEDULE_PROPOSED:PROFESSIONAL',
          'RESCHEDULE_ACCEPTED_PLAYER:AMATEUR',
          'RESCHEDULE_ACCEPTED_COACH:PROFESSIONAL',
        ]),
      );

      // The room shows nothing pending; the admin ledger keeps the history.
      const ledger = (
        await request(server())
          .get('/admin/payments?status=held')
          .set('Cookie', adminCookie)
          .expect(200)
      ).body as AdminPaymentListResponse;
      expect(
        ledger.items.find((i) => i.sessionId === sessionId)?.reschedules,
      ).toEqual([
        expect.objectContaining({
          proposedBy: 'player',
          status: 'accepted',
          fromStartsAt: before.startsAt.toISOString(),
          toStartsAt: chosen.startsAt,
        }),
      ]);
    });

    it('decline, withdraw and expiry release the holds and keep the original time', async () => {
      const sessionId = await paidSessionStarting(72);
      const original = (
        await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })
      ).startsAt;

      const declined = await openSlot(120);
      await post(coachCookie, sessionId, '', { slotIds: [declined] }).expect(
        200,
      );
      await post(coachCookie, sessionId, '/decline').expect(403);
      await post(playerCookie, sessionId, '/decline').expect(200);
      expect(await slotStatus(declined)).toBe('OPEN');

      const withdrawn = await openSlot(121);
      await post(playerCookie, sessionId, '', { slotIds: [withdrawn] }).expect(
        200,
      );
      await post(coachCookie, sessionId, '/withdraw').expect(403);
      await post(playerCookie, sessionId, '/withdraw').expect(200);
      expect(await slotStatus(withdrawn)).toBe('OPEN');

      const expired = await openSlot(122);
      await post(playerCookie, sessionId, '', { slotIds: [expired] }).expect(
        200,
      );
      await reschedules.sweepOnce(new Date(Date.now() + 25 * HOUR));
      expect(await slotStatus(expired)).toBe('OPEN');
      const rows = await prisma.sessionReschedule.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.status)).toEqual([
        'DECLINED',
        'WITHDRAWN',
        'EXPIRED',
      ]);
      expect(
        (await outboxOf(sessionId))
          .filter((r) => r.kind === 'RESCHEDULE_EXPIRED')
          .map((r) => r.role)
          .sort(),
      ).toEqual(['AMATEUR', 'PROFESSIONAL']);
      // Nothing answered, nothing moved — and the late accept conflicts.
      expect(
        (await prisma.session.findUniqueOrThrow({ where: { id: sessionId } }))
          .startsAt,
      ).toEqual(original);
      await post(coachCookie, sessionId, '/decline').expect(409);
    });

    it('refuses what the rules forbid', async () => {
      const sessionId = await paidSessionStarting(72);
      const valid = await openSlot(120);

      // Malformed, foreign, wrong duration, too soon, too far.
      await post(playerCookie, sessionId, '', { slotIds: [] }).expect(400);
      await post(playerCookie, sessionId, '', {
        slotIds: [valid, valid],
      }).expect(400);
      const longSlot = await prisma.availabilitySlot.create({
        data: {
          profileId: coachProfileId,
          startsAt: new Date(Date.now() + 130 * HOUR),
          endsAt: new Date(Date.now() + 132 * HOUR),
          source: 'MANUAL',
        },
      });
      await post(playerCookie, sessionId, '', {
        slotIds: [longSlot.id],
      }).expect(400);
      await post(playerCookie, sessionId, '', {
        slotIds: [await openSlot(1)],
      }).expect(400);
      await post(playerCookie, sessionId, '', {
        slotIds: [await openSlot(40 * 24)],
      }).expect(400);
      expect(await slotStatus(valid)).toBe('OPEN');

      // One open proposal at a time.
      await post(playerCookie, sessionId, '', { slotIds: [valid] }).expect(200);
      await post(coachCookie, sessionId, '', {
        slotIds: [await openSlot(123)],
      }).expect(409);
      await post(playerCookie, sessionId, '/withdraw').expect(200);

      // Too close to the start.
      const soon = await paidSessionStarting(1.5);
      await post(playerCookie, soon, '', { slotIds: [valid] }).expect(409);

      // Third reschedule.
      await prisma.session.update({
        where: { id: sessionId },
        data: { rescheduleCount: 2 },
      });
      const again = (
        await request(server())
          .get(`/sessions/${sessionId}`)
          .set('Cookie', playerCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(again.rescheduleAllowed).toBe(false);
      await post(playerCookie, sessionId, '', { slotIds: [valid] }).expect(409);
    });

    it('an accept racing a cancellation: exactly one wins, no slot stays held', async () => {
      for (let round = 0; round < 4; round++) {
        const sessionId = await paidSessionStarting(72);
        const offered = await openSlot(120 + round);
        const proposed = (
          await post(playerCookie, sessionId, '', {
            slotIds: [offered],
          }).expect(200)
        ).body as SessionResponse;
        const optionId = proposed.reschedule!.options[0].id;

        const [accept, cancel] = await Promise.all([
          post(coachCookie, sessionId, '/accept', { optionId }),
          request(server())
            .post(`/sessions/${sessionId}/cancel`)
            .set('Cookie', playerCookie),
        ]);
        expect([accept.status, cancel.status].sort()).toEqual([200, 409]);

        const session = await prisma.session.findUniqueOrThrow({
          where: { id: sessionId },
        });
        await reschedules.sweepOnce();
        if (accept.status === 200) {
          expect(session.status).toBe('PAID_ESCROW');
          expect(session.slotId).toBe(offered);
          expect(await slotStatus(offered)).toBe('BOOKED');
        } else {
          expect(session.status).toBe('CANCELLED');
          // The proposal died with the session; its slot is free again.
          expect(await slotStatus(offered)).toBe('OPEN');
          expect(
            await prisma.sessionReschedule.count({
              where: { sessionId, status: 'OPEN' },
            }),
          ).toBe(0);
        }
      }
    });

    it('no loophole: a move accepted inside the window keeps the partial tier', async () => {
      const sessionId = await paidSessionStarting(10);
      const nextWeek = await openSlot(7 * 24);
      const proposed = (
        await post(playerCookie, sessionId, '', {
          slotIds: [nextWeek],
        }).expect(200)
      ).body as SessionResponse;
      await post(coachCookie, sessionId, '/accept', {
        optionId: proposed.reschedule!.options[0].id,
      }).expect(200);

      const moved = (
        await request(server())
          .get(`/sessions/${sessionId}`)
          .set('Cookie', playerCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(moved.cancellationTerms).toMatchObject({
        tier: 'partial',
        refundMinor: 2003,
      });
      const cancelled = (
        await request(server())
          .post(`/sessions/${sessionId}/cancel`)
          .set('Cookie', playerCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(cancelled.cancellation?.tier).toBe('partial');
    });

    it('the coach asked to move: the player cancels for free, even this late', async () => {
      const sessionId = await paidSessionStarting(5);
      await post(coachCookie, sessionId, '', {
        slotIds: [await openSlot(100)],
      }).expect(200);

      // While it is open…
      const open = (
        await request(server())
          .get(`/sessions/${sessionId}`)
          .set('Cookie', playerCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(open.cancellationTerms?.tier).toBe('free');

      // …and after the player declined it.
      await post(playerCookie, sessionId, '/decline').expect(200);
      const cancelled = (
        await request(server())
          .post(`/sessions/${sessionId}/cancel`)
          .set('Cookie', playerCookie)
          .expect(200)
      ).body as SessionResponse;
      expect(cancelled.cancellation).toMatchObject({
        tier: 'free',
        refundMinor: 4005,
      });
      expect(await paymentStatusOf(sessionId)).toBe('REFUNDED');
    });

    it('reminders are re-armed for the new time', async () => {
      const sessionId = await paidSessionStarting(20);
      await prisma.session.update({
        where: { id: sessionId },
        data: { inviteSentAt: new Date(Date.now() - 5 * DAY) },
      });
      await scan.scanOnce();
      const remindersOf = async () =>
        (await outboxOf(sessionId)).filter(
          (r) => r.kind === 'SESSION_REMINDER_24H',
        ).length;
      expect(await remindersOf()).toBe(2);

      const proposed = (
        await post(playerCookie, sessionId, '', {
          slotIds: [await openSlot(200)],
        }).expect(200)
      ).body as SessionResponse;
      await post(coachCookie, sessionId, '/accept', {
        optionId: proposed.reschedule!.options[0].id,
      }).expect(200);

      // The new start comes within a day: time travel on every stamp — the
      // old time's reminders went out before the move, the move was days ago.
      await prisma.notification.updateMany({
        where: { sessionId, kind: 'SESSION_REMINDER_24H' },
        data: { createdAt: new Date(Date.now() - 4 * DAY) },
      });
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          startsAt: new Date(Date.now() + 20 * HOUR),
          endsAt: new Date(Date.now() + 21 * HOUR),
          rescheduledAt: new Date(Date.now() - 3 * DAY),
        },
      });
      await scan.scanOnce();
      await scan.scanOnce();
      expect(await remindersOf()).toBe(4);
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
      // Coach cancellation: both parties plus an admin heads-up; the CANCEL
      // .ics sequence outranks the invite.
      const cancelled = (await outboxOf(sessionId)).filter((r) =>
        r.kind.startsWith('SESSION_CANCELLED_'),
      );
      expect(cancelled.map((r) => `${r.kind}:${r.role}`)).toEqual([
        'SESSION_CANCELLED_PLAYER:AMATEUR',
        'SESSION_CANCELLED_COACH:PROFESSIONAL',
        'SESSION_CANCELLED_ADMIN:ADMIN',
      ]);
      expect(cancelled[0].payload).toEqual({
        cancelledBy: 'coach',
        tier: 'free',
        refundMinor: 4005,
      });
      const after = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(after.calendarSequence).toBe(1);
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
