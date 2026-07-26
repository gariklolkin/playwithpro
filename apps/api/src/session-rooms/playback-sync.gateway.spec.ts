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
});
