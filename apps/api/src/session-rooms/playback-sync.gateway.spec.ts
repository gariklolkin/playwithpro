import { Role } from '@playwithpro/shared';
import type { Namespace, Socket } from 'socket.io';
import type { TokenService } from '../auth/token.service';
import { PlaybackSyncGateway } from './playback-sync.gateway';
import type { SessionRoomsService } from './session-rooms.service';

const SESSION_ID = 'sess-1';

function fakeSocket(
  overrides: Partial<{
    cookie: string | undefined;
    auth: Record<string, unknown>;
  }> = {},
) {
  const peerEmit = jest.fn();
  const socket = {
    handshake: {
      headers: { cookie: overrides.cookie ?? 'access_token=tok' },
      auth: overrides.auth ?? { sessionId: SESSION_ID },
    },
    data: {} as { sessionId?: string },
    join: jest.fn(),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: peerEmit }),
    disconnect: jest.fn(),
  };
  return { socket: socket as unknown as Socket, raw: socket, peerEmit };
}

describe('PlaybackSyncGateway', () => {
  const tokens = { verifyAccessToken: jest.fn() };
  const rooms = { authorizePlaybackSync: jest.fn() };
  const adapterRooms = new Map<string, Set<string>>();
  /** namespace.to(room).emit — broadcasts that include the sender. */
  const roomEmit = jest.fn();
  let gateway: PlaybackSyncGateway;
  type HandshakeMiddleware = (
    socket: Socket,
    next: (error?: Error) => void,
  ) => void;
  let middleware: HandshakeMiddleware;

  /** Runs the handshake middleware; on success completes the connection. */
  async function connect(socket: Socket): Promise<Error | undefined> {
    const error = await new Promise<Error | undefined>((resolve) => {
      middleware(socket, resolve);
    });
    if (!error) {
      gateway.handleConnection(socket);
    }
    return error;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    adapterRooms.clear();
    tokens.verifyAccessToken.mockReturnValue({
      sub: 'player-1',
      role: Role.Amateur,
    });
    rooms.authorizePlaybackSync.mockResolvedValue(undefined);
    gateway = new PlaybackSyncGateway(
      tokens as unknown as TokenService,
      rooms as unknown as SessionRoomsService,
    );
    const registered: HandshakeMiddleware[] = [];
    const namespace = {
      use: (mw: HandshakeMiddleware) => registered.push(mw),
      adapter: { rooms: adapterRooms },
      to: jest.fn().mockReturnValue({ emit: roomEmit }),
    };
    (gateway as unknown as { namespace: Namespace }).namespace =
      namespace as unknown as Namespace;
    gateway.afterInit(namespace as unknown as Namespace);
    middleware = registered[0];
  });

  it('admits an authorized party and joins the session room', async () => {
    const { socket, raw } = fakeSocket();
    const error = await connect(socket);
    expect(error).toBeUndefined();
    expect(rooms.authorizePlaybackSync).toHaveBeenCalledWith(
      { id: 'player-1', role: Role.Amateur },
      SESSION_ID,
    );
    expect(raw.join).toHaveBeenCalledWith(`session:${SESSION_ID}`);
    // No shared state yet — nothing replayed.
    expect(raw.emit).not.toHaveBeenCalled();
  });

  it('rejects the handshake when the token is missing or invalid', async () => {
    const { socket, raw } = fakeSocket({ cookie: undefined, auth: {} });
    expect(await connect(socket)).toBeInstanceOf(Error);
    expect(raw.join).not.toHaveBeenCalled();

    tokens.verifyAccessToken.mockImplementation(() => {
      throw new Error('bad token');
    });
    const second = fakeSocket();
    expect(await connect(second.socket)).toBeInstanceOf(Error);
  });

  it('rejects a third party the authorization check refuses', async () => {
    rooms.authorizePlaybackSync.mockRejectedValue(new Error('not found'));
    const { socket, raw } = fakeSocket();
    expect(await connect(socket)).toBeInstanceOf(Error);
    expect(raw.join).not.toHaveBeenCalled();
  });

  it('rejects outside the join window and for non-video-analysis sessions', async () => {
    // The gateway treats every authorization failure identically.
    rooms.authorizePlaybackSync.mockRejectedValue(
      new Error('room closed / wrong service'),
    );
    const { socket } = fakeSocket();
    expect(await connect(socket)).toBeInstanceOf(Error);
  });

  it('rejects a handshake without a session id', async () => {
    const { socket } = fakeSocket({ auth: {} });
    expect(await connect(socket)).toBeInstanceOf(Error);
  });

  it('relays a published state to the peer with a server stamp, last writer wins', async () => {
    const { socket, raw, peerEmit } = fakeSocket();
    await connect(socket);

    const before = Date.now();
    gateway.publish(socket, {
      playing: true,
      positionSeconds: 134,
      emittedAtMs: 12345, // client stamp must be replaced
    });
    expect(raw.to).toHaveBeenCalledWith(`session:${SESSION_ID}`);
    const relayed = peerEmit.mock.calls[0] as [string, unknown];
    expect(relayed[0]).toBe('playback:state');
    const state = relayed[1] as {
      playing: boolean;
      positionSeconds: number;
      emittedAtMs: number;
    };
    expect(state.playing).toBe(true);
    expect(state.positionSeconds).toBe(134);
    expect(state.emittedAtMs).toBeGreaterThanOrEqual(before);

    // A later writer overwrites the shared state.
    gateway.publish(socket, { playing: false, positionSeconds: 10 });
    gateway.requestState(socket);
    const replay = raw.emit.mock.calls.at(-1) as [string, unknown];
    expect(replay[0]).toBe('playback:state');
    expect(replay[1]).toMatchObject({ playing: false, positionSeconds: 10 });
  });

  it('drops malformed payloads', async () => {
    const { socket, raw, peerEmit } = fakeSocket();
    await connect(socket);
    gateway.publish(socket, { playing: 'yes', positionSeconds: 1 });
    gateway.publish(socket, { playing: true, positionSeconds: -5 });
    gateway.publish(socket, { playing: true, positionSeconds: Infinity });
    gateway.publish(socket, null);
    expect(peerEmit).not.toHaveBeenCalled();
    gateway.requestState(socket);
    expect(raw.emit).not.toHaveBeenCalled();
  });

  it('replays the last state to a newly connected socket', async () => {
    const writer = fakeSocket();
    await connect(writer.socket);
    gateway.publish(writer.socket, { playing: true, positionSeconds: 60 });

    const late = fakeSocket();
    await connect(late.socket);
    const replay = late.raw.emit.mock.calls[0] as [string, unknown];
    expect(replay[0]).toBe('playback:state');
    expect(replay[1]).toMatchObject({ playing: true, positionSeconds: 60 });
  });

  it('drops the stored state once the room empties', async () => {
    const { socket } = fakeSocket();
    await connect(socket);
    gateway.publish(socket, { playing: true, positionSeconds: 60 });

    // Peer still present: state survives.
    adapterRooms.set(`session:${SESSION_ID}`, new Set(['peer-socket']));
    gateway.handleDisconnect(socket);
    const rejoin = fakeSocket();
    await connect(rejoin.socket);
    expect(rejoin.raw.emit).toHaveBeenCalled();

    // Room empty: state dropped.
    adapterRooms.delete(`session:${SESSION_ID}`);
    gateway.handleDisconnect(socket);
    const fresh = fakeSocket();
    await connect(fresh.socket);
    expect(fresh.raw.emit).not.toHaveBeenCalled();
  });

  describe('annotations', () => {
    const stroke = (overrides: Record<string, unknown> = {}) => ({
      id: '6f1c2d3e-0000-4000-8000-000000000001',
      momentKey: '134.2',
      tool: 'line',
      color: '#2563EB',
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.8, y: 0.9 },
      ],
      createdAtMs: 1,
      ...overrides,
    });

    function connectAs(userId: string) {
      tokens.verifyAccessToken.mockReturnValue({
        sub: userId,
        role: Role.Amateur,
      });
      return fakeSocket();
    }

    it('stores a valid stroke under the socket user and relays it to the peer', async () => {
      const { socket, raw, peerEmit } = connectAs('coach-1');
      await connect(socket);
      gateway.addAnnotation(socket, stroke({ authorId: 'spoofed' }));
      expect(peerEmit).toHaveBeenCalledWith(
        'annotation:added',
        expect.objectContaining({
          id: '6f1c2d3e-0000-4000-8000-000000000001',
          authorId: 'coach-1',
          color: '#2563eb',
          tool: 'line',
        }),
      );
      gateway.requestAnnotationState(socket);
      const replay = raw.emit.mock.calls.at(-1) as [string, unknown];
      expect(replay[0]).toBe('annotation:state');
      expect(replay[1]).toEqual({
        '134.2': [expect.objectContaining({ authorId: 'coach-1' })],
      });
    });

    it('drops malformed strokes and ignores duplicate ids', async () => {
      const { socket, raw, peerEmit } = connectAs('coach-1');
      await connect(socket);
      const bad: unknown[] = [
        null,
        stroke({ id: 'not an id!' }),
        stroke({ momentKey: '1.23' }),
        stroke({ momentKey: 134.2 }),
        stroke({ tool: 'circle' }),
        stroke({ color: 'blue' }),
        stroke({ points: [{ x: 0.1, y: 0.2 }] }), // line needs two
        stroke({ tool: 'angle' }), // angle needs three
        stroke({
          points: [
            { x: 1.5, y: 0 },
            { x: 0, y: 0 },
          ],
        }),
        stroke({
          points: [
            { x: 'a', y: 0 },
            { x: 0, y: 0 },
          ],
        }),
        stroke({
          tool: 'pen',
          points: Array.from({ length: 201 }, () => ({ x: 0.5, y: 0.5 })),
        }),
      ];
      for (const body of bad) gateway.addAnnotation(socket, body);
      expect(peerEmit).not.toHaveBeenCalled();

      gateway.addAnnotation(socket, stroke());
      gateway.addAnnotation(socket, stroke({ color: '#ff0000' }));
      expect(peerEmit).toHaveBeenCalledTimes(1);
      gateway.requestAnnotationState(socket);
      const replay = raw.emit.mock.calls.at(-1) as [string, unknown];
      expect((replay[1] as Record<string, unknown[]>)['134.2']).toHaveLength(1);
    });

    it('caps strokes per moment and moments per session', async () => {
      const { socket, peerEmit } = connectAs('coach-1');
      await connect(socket);
      for (let i = 0; i < 101; i++) {
        gateway.addAnnotation(
          socket,
          stroke({
            id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          }),
        );
      }
      expect(peerEmit).toHaveBeenCalledTimes(100);

      peerEmit.mockClear();
      for (let i = 0; i < 51; i++) {
        gateway.addAnnotation(
          socket,
          stroke({
            id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
            momentKey: `${i + 1}.0`,
          }),
        );
      }
      // 49 new moments fit beside the existing '134.2'; the rest are dropped.
      expect(peerEmit).toHaveBeenCalledTimes(49);
    });

    it("undo removes only the sender's latest stroke on the moment", async () => {
      const coach = connectAs('coach-1');
      await connect(coach.socket);
      const player = connectAs('player-1');
      await connect(player.socket);
      gateway.addAnnotation(
        coach.socket,
        stroke({ id: 'c0000000-0000-4000-8000-000000000001' }),
      );
      gateway.addAnnotation(
        player.socket,
        stroke({ id: 'a0000000-0000-4000-8000-000000000001' }),
      );
      gateway.addAnnotation(
        coach.socket,
        stroke({ id: 'c0000000-0000-4000-8000-000000000002' }),
      );

      gateway.undoAnnotation(coach.socket, { momentKey: '134.2' });
      expect(roomEmit).toHaveBeenLastCalledWith('annotation:removed', {
        momentKey: '134.2',
        strokeId: 'c0000000-0000-4000-8000-000000000002',
      });

      gateway.requestAnnotationState(player.socket);
      const replay = player.raw.emit.mock.calls.at(-1) as [string, unknown];
      expect(
        (replay[1] as Record<string, { id: string }[]>)['134.2'].map(
          (s) => s.id,
        ),
      ).toEqual([
        'c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001',
      ]);

      // Nothing of ours left on an unknown moment: silent no-op.
      roomEmit.mockClear();
      gateway.undoAnnotation(coach.socket, { momentKey: '9.9' });
      gateway.undoAnnotation(coach.socket, { momentKey: 'nope' });
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('clear empties a moment for everyone and leaves other moments alone', async () => {
      const coach = connectAs('coach-1');
      await connect(coach.socket);
      const player = connectAs('player-1');
      await connect(player.socket);
      gateway.addAnnotation(
        coach.socket,
        stroke({ id: 'c0000000-0000-4000-8000-000000000001' }),
      );
      gateway.addAnnotation(
        player.socket,
        stroke({ id: 'a0000000-0000-4000-8000-000000000001' }),
      );
      gateway.addAnnotation(
        coach.socket,
        stroke({
          id: 'c0000000-0000-4000-8000-000000000002',
          momentKey: '34.0',
        }),
      );

      gateway.clearAnnotations(player.socket, { momentKey: '134.2' });
      expect(roomEmit).toHaveBeenLastCalledWith('annotation:cleared', {
        momentKey: '134.2',
      });
      gateway.requestAnnotationState(coach.socket);
      const replay = coach.raw.emit.mock.calls.at(-1) as [string, unknown];
      expect(Object.keys(replay[1] as object)).toEqual(['34.0']);

      roomEmit.mockClear();
      gateway.clearAnnotations(player.socket, { momentKey: '134.2' });
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('sends the full state to a late joiner and drops it once the room empties', async () => {
      const coach = connectAs('coach-1');
      await connect(coach.socket);
      gateway.addAnnotation(coach.socket, stroke());
      gateway.addAnnotation(
        coach.socket,
        stroke({
          id: 'c0000000-0000-4000-8000-000000000002',
          momentKey: '34.0',
        }),
      );

      const late = connectAs('player-1');
      await connect(late.socket);
      const replay = late.raw.emit.mock.calls.find(
        ([event]) => event === 'annotation:state',
      ) as [string, unknown];
      expect(Object.keys(replay[1] as object).sort()).toEqual([
        '134.2',
        '34.0',
      ]);

      adapterRooms.delete(`session:${SESSION_ID}`);
      gateway.handleDisconnect(coach.socket);
      const fresh = connectAs('player-1');
      await connect(fresh.socket);
      expect(fresh.raw.emit).not.toHaveBeenCalled();
    });
  });
});
