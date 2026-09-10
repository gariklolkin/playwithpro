import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ANNOTATION_EVENTS,
  AnnotationClearedPayload,
  AnnotationRemovedPayload,
  AnnotationState,
  PLAYBACK_SYNC_EVENTS,
  PlaybackState,
  Role,
  Stroke,
} from '@playwithpro/shared';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/prisma/prisma.service';

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** See session-rooms.e2e-spec.ts: retry TRUNCATE past startup-sweep locks. */
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

function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for '${event}'`)),
      5_000,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/**
 * Playback sync channel handshake and relay against a real listening server:
 * parties admitted inside the window, everyone else silently dropped.
 */
describe('Playback sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  let playerCookie: string;
  let coachCookie: string;
  let rivalCookie: string;

  let analysisSessionId: string;
  let futureSessionId: string;
  let consultationSessionId: string;

  const sockets: Socket[] = [];

  function connect(cookie: string, sessionId: string): Socket {
    const socket = io(`${baseUrl}/playback-sync`, {
      transports: ['websocket'],
      reconnection: false,
      // One Manager per socket — otherwise sockets share the first
      // connection and its headers, mixing identities between tests.
      forceNew: true,
      extraHeaders: { cookie },
      auth: { sessionId },
    });
    sockets.push(socket);
    return socket;
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
    // The gateway needs a real listening server for socket.io clients.
    await app.listen(0);
    const address = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);
    await truncateAll(prisma);

    const coach = await prisma.user.create({
      data: {
        email: 'sync-coach@e2e.test',
        role: 'PROFESSIONAL',
        displayName: 'Sync Coach',
        proProfile: {
          create: {
            status: 'VERIFIED',
            bio: 'coaching',
            languages: ['en'],
            services: {
              create: [
                { type: 'VIDEO_ANALYSIS', priceMinor: 5000, currency: 'EUR' },
              ],
            },
          },
        },
      },
      include: { proProfile: true },
    });
    const player = await prisma.user.create({
      data: {
        email: 'sync-player@e2e.test',
        role: 'AMATEUR',
        displayName: 'Sync Player',
      },
    });
    const rival = await prisma.user.create({
      data: {
        email: 'sync-rival@e2e.test',
        role: 'AMATEUR',
        displayName: 'Sync Rival',
      },
    });

    const profileId = coach.proProfile!.id;
    async function seedSession(
      slug: string,
      serviceType: 'VIDEO_ANALYSIS' | 'CONSULTATION',
      startsAt: Date,
      endsAt: Date,
      status: 'IN_PROGRESS' | 'PAID_ESCROW',
    ): Promise<string> {
      const slot = await prisma.availabilitySlot.create({
        data: { profileId, startsAt, endsAt, source: 'MANUAL' },
      });
      const session = await prisma.session.create({
        data: {
          playerId: player.id,
          proProfileId: profileId,
          serviceType,
          priceMinor: 5000,
          currency: 'EUR',
          platformFeeMinor: 500,
          slotId: slot.id,
          status,
          startsAt,
          endsAt,
          roomSlug: slug,
        },
      });
      return session.id;
    }

    analysisSessionId = await seedSession(
      'sync-e2e-current',
      'VIDEO_ANALYSIS',
      new Date(Date.now() - 10 * MINUTE),
      new Date(Date.now() + 50 * MINUTE),
      'IN_PROGRESS',
    );
    futureSessionId = await seedSession(
      'sync-e2e-future',
      'VIDEO_ANALYSIS',
      new Date(Date.now() + 24 * HOUR),
      new Date(Date.now() + 25 * HOUR),
      'PAID_ESCROW',
    );
    consultationSessionId = await seedSession(
      'sync-e2e-consult',
      'CONSULTATION',
      new Date(Date.now() - 10 * MINUTE),
      new Date(Date.now() + 50 * MINUTE),
      'IN_PROGRESS',
    );

    const tokens = app.get(TokenService);
    playerCookie = `access_token=${tokens.signAccessToken(player.id, Role.Amateur)}`;
    coachCookie = `access_token=${tokens.signAccessToken(coach.id, Role.Professional)}`;
    rivalCookie = `access_token=${tokens.signAccessToken(rival.id, Role.Amateur)}`;
  }, 30_000);

  afterEach(() => {
    for (const socket of sockets.splice(0)) {
      socket.disconnect();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('relays a published state between the parties with a server stamp', async () => {
    const playerSocket = connect(playerCookie, analysisSessionId);
    const coachSocket = connect(coachCookie, analysisSessionId);
    await Promise.all([
      waitForEvent(playerSocket, 'connect'),
      waitForEvent(coachSocket, 'connect'),
    ]);

    const received = waitForEvent<PlaybackState>(
      coachSocket,
      PLAYBACK_SYNC_EVENTS.state,
    );
    const before = Date.now();
    playerSocket.emit(PLAYBACK_SYNC_EVENTS.publish, {
      playing: true,
      positionSeconds: 134,
      emittedAtMs: 1, // must be replaced by the server stamp
    });
    const state = await received;
    expect(state.playing).toBe(true);
    expect(state.positionSeconds).toBe(134);
    expect(state.emittedAtMs).toBeGreaterThanOrEqual(before);
  });

  it('replays the current state to a late joiner while the room is occupied', async () => {
    const playerSocket = connect(playerCookie, analysisSessionId);
    await waitForEvent(playerSocket, 'connect');
    playerSocket.emit(PLAYBACK_SYNC_EVENTS.publish, {
      playing: false,
      positionSeconds: 42,
      emittedAtMs: 1,
    });

    // The publish has no listener to await; the late joiner's replay is the
    // observable effect, so poll the connect+replay as one step.
    const late = connect(coachCookie, analysisSessionId);
    const replay = await waitForEvent<PlaybackState>(
      late,
      PLAYBACK_SYNC_EVENTS.state,
    );
    expect(replay).toMatchObject({ playing: false, positionSeconds: 42 });
  });

  it('rejects a third party', async () => {
    const socket = connect(rivalCookie, analysisSessionId);
    await waitForEvent(socket, 'connect_error');
    expect(socket.connected).toBe(false);
  });

  it('rejects an unauthenticated connection', async () => {
    const socket = io(`${baseUrl}/playback-sync`, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      auth: { sessionId: analysisSessionId },
    });
    sockets.push(socket);
    await waitForEvent(socket, 'connect_error');
    expect(socket.connected).toBe(false);
  });

  it('rejects a party outside the join window', async () => {
    const socket = connect(playerCookie, futureSessionId);
    await waitForEvent(socket, 'connect_error');
    expect(socket.connected).toBe(false);
  });

  it('rejects connections to non-video-analysis sessions', async () => {
    const socket = connect(playerCookie, consultationSessionId);
    await waitForEvent(socket, 'connect_error');
    expect(socket.connected).toBe(false);
  });

  describe('annotations', () => {
    const lineStroke = (id: string, momentKey = '134.2') => ({
      id,
      momentKey,
      tool: 'line',
      color: '#2563eb',
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.8, y: 0.9 },
      ],
      createdAtMs: Date.now(),
    });

    it('relays add, undo and clear between the parties', async () => {
      const playerSocket = connect(playerCookie, analysisSessionId);
      const coachSocket = connect(coachCookie, analysisSessionId);
      await Promise.all([
        waitForEvent(playerSocket, 'connect'),
        waitForEvent(coachSocket, 'connect'),
      ]);

      const added = waitForEvent<Stroke>(playerSocket, ANNOTATION_EVENTS.added);
      coachSocket.emit(
        ANNOTATION_EVENTS.add,
        lineStroke('c0000000-0000-4000-8000-000000000001'),
      );
      const stroke = await added;
      expect(stroke.id).toBe('c0000000-0000-4000-8000-000000000001');
      expect(stroke.authorId).toBeDefined();
      expect(stroke.tool).toBe('line');

      const playerAdded = waitForEvent<Stroke>(
        coachSocket,
        ANNOTATION_EVENTS.added,
      );
      playerSocket.emit(
        ANNOTATION_EVENTS.add,
        lineStroke('a0000000-0000-4000-8000-000000000001'),
      );
      await playerAdded;

      // Coach undo removes the coach's stroke, not the player's.
      const removed = waitForEvent<AnnotationRemovedPayload>(
        playerSocket,
        ANNOTATION_EVENTS.removed,
      );
      coachSocket.emit(ANNOTATION_EVENTS.undo, { momentKey: '134.2' });
      expect(await removed).toEqual({
        momentKey: '134.2',
        strokeId: 'c0000000-0000-4000-8000-000000000001',
      });

      const cleared = waitForEvent<AnnotationClearedPayload>(
        coachSocket,
        ANNOTATION_EVENTS.cleared,
      );
      playerSocket.emit(ANNOTATION_EVENTS.clear, { momentKey: '134.2' });
      expect(await cleared).toEqual({ momentKey: '134.2' });
    });

    it('sends the current annotation state to a late joiner', async () => {
      const coachSocket = connect(coachCookie, analysisSessionId);
      await waitForEvent(coachSocket, 'connect');
      coachSocket.emit(
        ANNOTATION_EVENTS.add,
        lineStroke('c0000000-0000-4000-8000-000000000011', '34.0'),
      );
      coachSocket.emit(
        ANNOTATION_EVENTS.add,
        lineStroke('c0000000-0000-4000-8000-000000000012', '134.2'),
      );

      const late = connect(playerCookie, analysisSessionId);
      const state = await waitForEvent<AnnotationState>(
        late,
        ANNOTATION_EVENTS.state,
      );
      expect(Object.keys(state).sort()).toEqual(['134.2', '34.0']);
      expect(state['34.0'][0].id).toBe('c0000000-0000-4000-8000-000000000011');
    });

    it('ignores an oversized stroke', async () => {
      const playerSocket = connect(playerCookie, analysisSessionId);
      const coachSocket = connect(coachCookie, analysisSessionId);
      await Promise.all([
        waitForEvent(playerSocket, 'connect'),
        waitForEvent(coachSocket, 'connect'),
      ]);
      const received: Stroke[] = [];
      playerSocket.on(ANNOTATION_EVENTS.added, (s: Stroke) => received.push(s));
      coachSocket.emit(ANNOTATION_EVENTS.add, {
        ...lineStroke('c0000000-0000-4000-8000-000000000021'),
        tool: 'pen',
        points: Array.from({ length: 201 }, () => ({ x: 0.5, y: 0.5 })),
      });
      // A valid stroke sent afterwards proves the oversized one was dropped
      // rather than delayed.
      const added = waitForEvent<Stroke>(playerSocket, ANNOTATION_EVENTS.added);
      coachSocket.emit(
        ANNOTATION_EVENTS.add,
        lineStroke('c0000000-0000-4000-8000-000000000022'),
      );
      await added;
      expect(received.map((s) => s.id)).toEqual([
        'c0000000-0000-4000-8000-000000000022',
      ]);
    });

    it('still rejects a third party', async () => {
      const socket = connect(rivalCookie, analysisSessionId);
      await waitForEvent(socket, 'connect_error');
      expect(socket.connected).toBe(false);
    });
  });
});
