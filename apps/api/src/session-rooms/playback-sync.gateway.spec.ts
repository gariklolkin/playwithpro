import { Role } from '@playwithpro/shared';
import type { Namespace, Socket } from 'socket.io';
import type { TokenService } from '../auth/token.service';
import { PlaybackSyncGateway } from './playback-sync.gateway';
import type { SessionRoomsService } from './session-rooms.service';

const SESSION_ID = 'sess-1';
const CLIP_A = '11111111-1111-4111-8111-111111111111';
const CLIP_B = '22222222-2222-4222-8222-222222222222';
const FOREIGN_CLIP = '99999999-9999-4999-8999-999999999999';

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
  const rooms = {
    authorizePlaybackSync: jest.fn(),
    attachedVideoIds: jest.fn(),
  };
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
    rooms.attachedVideoIds.mockResolvedValue([CLIP_A, CLIP_B]);
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
    await gateway.publish(socket, {
      videoId: CLIP_A,
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
    await gateway.publish(socket, {
      videoId: CLIP_A,
      playing: false,
      positionSeconds: 10,
    });
    gateway.requestState(socket);
    const replay = raw.emit.mock.calls.at(-1) as [string, unknown];
    expect(replay[0]).toBe('playback:state');
    expect(replay[1]).toMatchObject({ playing: false, positionSeconds: 10 });
  });

  it('drops malformed payloads', async () => {
    const { socket, raw, peerEmit } = fakeSocket();
    await connect(socket);
    const bad: unknown[] = [
      { videoId: CLIP_A, playing: 'yes', positionSeconds: 1 },
      { videoId: CLIP_A, playing: true, positionSeconds: -5 },
      { videoId: CLIP_A, playing: true, positionSeconds: Infinity },
      { videoId: CLIP_A, playing: true, positionSeconds: 1, rate: 50 },
      { videoId: CLIP_A, playing: true, positionSeconds: 1, rate: 0 },
      { videoId: CLIP_A, playing: true, positionSeconds: 1, rate: '1' },
      { playing: true, positionSeconds: 1 }, // no clip
      { videoId: 'clip', playing: true, positionSeconds: 1 },
      null,
    ];
    for (const body of bad) await gateway.publish(socket, body);
    expect(peerEmit).not.toHaveBeenCalled();
    gateway.requestState(socket);
    expect(raw.emit).not.toHaveBeenCalled();
  });

  it('relays the playback rate and defaults a missing one to 1', async () => {
    const { socket, peerEmit } = fakeSocket();
    await connect(socket);
    await gateway.publish(socket, {
      videoId: CLIP_A,
      playing: true,
      positionSeconds: 5,
      rate: 0.25,
    });
    expect(peerEmit).toHaveBeenLastCalledWith(
      'playback:state',
      expect.objectContaining({ rate: 0.25 }),
    );
    await gateway.publish(socket, {
      videoId: CLIP_A,
      playing: true,
      positionSeconds: 6,
    });
    expect(peerEmit).toHaveBeenLastCalledWith(
      'playback:state',
      expect.objectContaining({ positionSeconds: 6, rate: 1 }),
    );
  });

  it('replays the last state to a newly connected socket', async () => {
    const writer = fakeSocket();
    await connect(writer.socket);
    await gateway.publish(writer.socket, {
      videoId: CLIP_B,
      playing: true,
      positionSeconds: 60,
    });

    const late = fakeSocket();
    await connect(late.socket);
    const replay = late.raw.emit.mock.calls[0] as [string, unknown];
    expect(replay[0]).toBe('playback:state');
    // The late joiner lands on the shared clip, not the first one.
    expect(replay[1]).toMatchObject({
      videoId: CLIP_B,
      playing: true,
      positionSeconds: 60,
    });
  });

  describe('attached clips', () => {
    it('relays a clip switch as a paused snapshot at the start of the clip', async () => {
      const { socket, peerEmit } = fakeSocket();
      await connect(socket);
      await gateway.publish(socket, {
        videoId: CLIP_B,
        playing: false,
        positionSeconds: 0,
      });
      expect(peerEmit).toHaveBeenLastCalledWith(
        'playback:state',
        expect.objectContaining({
          videoId: CLIP_B,
          playing: false,
          positionSeconds: 0,
        }),
      );
    });

    it('drops a snapshot or stroke naming a clip that is not attached', async () => {
      const { socket, raw, peerEmit } = fakeSocket();
      await connect(socket);
      await gateway.publish(socket, {
        videoId: FOREIGN_CLIP,
        playing: true,
        positionSeconds: 1,
      });
      await gateway.addAnnotation(socket, {
        id: '6f1c2d3e-0000-4000-8000-000000000001',
        videoId: FOREIGN_CLIP,
        momentKey: '1.0',
        tool: 'line',
        color: '#2563eb',
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.8, y: 0.9 },
        ],
      });
      expect(peerEmit).not.toHaveBeenCalled();
      gateway.requestState(socket);
      gateway.requestAnnotationState(socket);
      expect(raw.emit).not.toHaveBeenCalled();
    });

    it('re-reads the attachment set on a miss so a newly attached clip is accepted', async () => {
      const { socket, peerEmit } = fakeSocket();
      await connect(socket);
      expect(rooms.attachedVideoIds).toHaveBeenCalledTimes(1);

      // Attached after the room opened (PUT /sessions/:id/videos).
      rooms.attachedVideoIds.mockResolvedValue([CLIP_A, CLIP_B, FOREIGN_CLIP]);
      await gateway.publish(socket, {
        videoId: FOREIGN_CLIP,
        playing: false,
        positionSeconds: 0,
      });
      expect(rooms.attachedVideoIds).toHaveBeenCalledTimes(2);
      expect(peerEmit).toHaveBeenCalledWith(
        'playback:state',
        expect.objectContaining({ videoId: FOREIGN_CLIP }),
      );

      // Another miss inside the refresh window is dropped without a re-read.
      peerEmit.mockClear();
      await gateway.publish(socket, {
        videoId: '77777777-7777-4777-8777-777777777777',
        playing: false,
        positionSeconds: 0,
      });
      expect(rooms.attachedVideoIds).toHaveBeenCalledTimes(2);
      expect(peerEmit).not.toHaveBeenCalled();
    });

    it('drops the cached attachment set once the room empties', async () => {
      const { socket } = fakeSocket();
      await connect(socket);
      adapterRooms.delete(`session:${SESSION_ID}`);
      gateway.handleDisconnect(socket);
      const fresh = fakeSocket();
      await connect(fresh.socket);
      expect(rooms.attachedVideoIds).toHaveBeenCalledTimes(2);
    });
  });

  it('drops the stored state once the room empties', async () => {
    const { socket } = fakeSocket();
    await connect(socket);
    await gateway.publish(socket, {
      videoId: CLIP_A,
      playing: true,
      positionSeconds: 60,
    });

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
      videoId: CLIP_A,
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
      await gateway.addAnnotation(socket, stroke({ authorId: 'spoofed' }));
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
        [CLIP_A]: {
          '134.2': [expect.objectContaining({ authorId: 'coach-1' })],
        },
      });
    });

    it('drops malformed strokes and ignores duplicate ids', async () => {
      const { socket, raw, peerEmit } = connectAs('coach-1');
      await connect(socket);
      const bad: unknown[] = [
        null,
        stroke({ id: 'not an id!' }),
        stroke({ videoId: undefined }),
        stroke({ videoId: 'clip' }),
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
      for (const body of bad) await gateway.addAnnotation(socket, body);
      expect(peerEmit).not.toHaveBeenCalled();

      await gateway.addAnnotation(socket, stroke());
      await gateway.addAnnotation(socket, stroke({ color: '#ff0000' }));
      expect(peerEmit).toHaveBeenCalledTimes(1);
      gateway.requestAnnotationState(socket);
      const replay = raw.emit.mock.calls.at(-1) as [string, unknown];
      expect(
        (replay[1] as Record<string, Record<string, unknown[]>>)[CLIP_A][
          '134.2'
        ],
      ).toHaveLength(1);
    });

    it('caps strokes per moment and moments per clip', async () => {
      const { socket, peerEmit } = connectAs('coach-1');
      await connect(socket);
      for (let i = 0; i < 101; i++) {
        await gateway.addAnnotation(
          socket,
          stroke({
            id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          }),
        );
      }
      expect(peerEmit).toHaveBeenCalledTimes(100);

      peerEmit.mockClear();
      for (let i = 0; i < 51; i++) {
        await gateway.addAnnotation(
          socket,
          stroke({
            id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
            momentKey: `${i + 1}.0`,
          }),
        );
      }
      // 49 new moments fit beside the existing '134.2'; the rest are dropped.
      expect(peerEmit).toHaveBeenCalledTimes(49);

      // The cap is per clip: the second clip still accepts a new moment.
      peerEmit.mockClear();
      await gateway.addAnnotation(
        socket,
        stroke({
          id: '20000000-0000-4000-8000-000000000001',
          videoId: CLIP_B,
          momentKey: '5.0',
        }),
      );
      expect(peerEmit).toHaveBeenCalledTimes(1);
    });

    it('keeps the strokes of different clips apart', async () => {
      const { socket, raw } = connectAs('coach-1');
      await connect(socket);
      await gateway.addAnnotation(
        socket,
        stroke({
          id: 'c0000000-0000-4000-8000-000000000001',
          momentKey: '60.0',
        }),
      );
      await gateway.addAnnotation(
        socket,
        stroke({
          id: 'c0000000-0000-4000-8000-000000000002',
          videoId: CLIP_B,
          momentKey: '60.0',
        }),
      );
      gateway.requestAnnotationState(socket);
      const replay = raw.emit.mock.calls.at(-1) as [string, unknown];
      const state = replay[1] as Record<
        string,
        Record<string, { id: string }[]>
      >;
      expect(state[CLIP_A]['60.0'].map((s) => s.id)).toEqual([
        'c0000000-0000-4000-8000-000000000001',
      ]);
      expect(state[CLIP_B]['60.0'].map((s) => s.id)).toEqual([
        'c0000000-0000-4000-8000-000000000002',
      ]);

      // Undo and clear address one clip only.
      gateway.undoAnnotation(socket, { videoId: CLIP_B, momentKey: '60.0' });
      expect(roomEmit).toHaveBeenLastCalledWith('annotation:removed', {
        videoId: CLIP_B,
        momentKey: '60.0',
        strokeId: 'c0000000-0000-4000-8000-000000000002',
      });
      gateway.requestAnnotationState(socket);
      const after = raw.emit.mock.calls.at(-1) as [string, unknown];
      expect(Object.keys(after[1] as object)).toEqual([CLIP_A]);
    });

    it("undo removes only the sender's latest stroke on the moment", async () => {
      const coach = connectAs('coach-1');
      await connect(coach.socket);
      const player = connectAs('player-1');
      await connect(player.socket);
      await gateway.addAnnotation(
        coach.socket,
        stroke({ id: 'c0000000-0000-4000-8000-000000000001' }),
      );
      await gateway.addAnnotation(
        player.socket,
        stroke({ id: 'a0000000-0000-4000-8000-000000000001' }),
      );
      await gateway.addAnnotation(
        coach.socket,
        stroke({ id: 'c0000000-0000-4000-8000-000000000002' }),
      );

      gateway.undoAnnotation(coach.socket, {
        videoId: CLIP_A,
        momentKey: '134.2',
      });
      expect(roomEmit).toHaveBeenLastCalledWith('annotation:removed', {
        videoId: CLIP_A,
        momentKey: '134.2',
        strokeId: 'c0000000-0000-4000-8000-000000000002',
      });

      gateway.requestAnnotationState(player.socket);
      const replay = player.raw.emit.mock.calls.at(-1) as [string, unknown];
      expect(
        (replay[1] as Record<string, Record<string, { id: string }[]>>)[CLIP_A][
          '134.2'
        ].map((s) => s.id),
      ).toEqual([
        'c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001',
      ]);

      // Nothing of ours left on an unknown moment: silent no-op.
      roomEmit.mockClear();
      gateway.undoAnnotation(coach.socket, {
        videoId: CLIP_A,
        momentKey: '9.9',
      });
      gateway.undoAnnotation(coach.socket, {
        videoId: CLIP_A,
        momentKey: 'nope',
      });
      gateway.undoAnnotation(coach.socket, { momentKey: '134.2' });
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('clear empties a moment for everyone and leaves other moments alone', async () => {
      const coach = connectAs('coach-1');
      await connect(coach.socket);
      const player = connectAs('player-1');
      await connect(player.socket);
      await gateway.addAnnotation(
        coach.socket,
        stroke({ id: 'c0000000-0000-4000-8000-000000000001' }),
      );
      await gateway.addAnnotation(
        player.socket,
        stroke({ id: 'a0000000-0000-4000-8000-000000000001' }),
      );
      await gateway.addAnnotation(
        coach.socket,
        stroke({
          id: 'c0000000-0000-4000-8000-000000000002',
          momentKey: '34.0',
        }),
      );

      gateway.clearAnnotations(player.socket, {
        videoId: CLIP_A,
        momentKey: '134.2',
      });
      expect(roomEmit).toHaveBeenLastCalledWith('annotation:cleared', {
        videoId: CLIP_A,
        momentKey: '134.2',
      });
      gateway.requestAnnotationState(coach.socket);
      const replay = coach.raw.emit.mock.calls.at(-1) as [string, unknown];
      expect(
        Object.keys((replay[1] as Record<string, object>)[CLIP_A]),
      ).toEqual(['34.0']);

      roomEmit.mockClear();
      gateway.clearAnnotations(player.socket, {
        videoId: CLIP_A,
        momentKey: '134.2',
      });
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('sends the full state to a late joiner and drops it once the room empties', async () => {
      const coach = connectAs('coach-1');
      await connect(coach.socket);
      await gateway.addAnnotation(coach.socket, stroke());
      await gateway.addAnnotation(
        coach.socket,
        stroke({
          id: 'c0000000-0000-4000-8000-000000000002',
          videoId: CLIP_B,
          momentKey: '34.0',
        }),
      );

      const late = connectAs('player-1');
      await connect(late.socket);
      const replay = late.raw.emit.mock.calls.find(
        ([event]) => event === 'annotation:state',
      ) as [string, unknown];
      const state = replay[1] as Record<string, object>;
      expect(Object.keys(state).sort()).toEqual([CLIP_A, CLIP_B].sort());
      expect(Object.keys(state[CLIP_A])).toEqual(['134.2']);
      expect(Object.keys(state[CLIP_B])).toEqual(['34.0']);

      adapterRooms.delete(`session:${SESSION_ID}`);
      gateway.handleDisconnect(coach.socket);
      const fresh = connectAs('player-1');
      await connect(fresh.socket);
      expect(fresh.raw.emit).not.toHaveBeenCalled();
    });
  });
});
