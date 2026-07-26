import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  PLAYBACK_SYNC_EVENTS,
  PLAYBACK_SYNC_NAMESPACE,
  PlaybackState,
  PlaybackSyncHandshake,
} from '@playwithpro/shared';
import type { Namespace, Socket } from 'socket.io';
import { ACCESS_TOKEN_COOKIE, AuthenticatedUser } from '../auth/auth-cookies';
import { TokenService } from '../auth/token.service';
import { SessionRoomsService } from './session-rooms.service';

interface SocketData {
  sessionId?: string;
}

function roomOf(sessionId: string): string {
  return `session:${sessionId}`;
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/** Untrusted wire payload → validated state, or null to drop it. */
function parseState(body: unknown): Omit<PlaybackState, 'emittedAtMs'> | null {
  if (typeof body !== 'object' || body === null) return null;
  const { playing, positionSeconds } = body as Record<string, unknown>;
  if (typeof playing !== 'boolean') return null;
  if (
    typeof positionSeconds !== 'number' ||
    !Number.isFinite(positionSeconds) ||
    positionSeconds < 0
  ) {
    return null;
  }
  return { playing, positionSeconds };
}

/**
 * Relay for shared playback state in video-analysis rooms. Holds no truth
 * beyond the last snapshot per session (last writer wins, server-stamped);
 * authorization mirrors the room contract via SessionRoomsService.
 *
 * Authorization runs as namespace middleware — before the connection is
 * acknowledged — so an admitted socket has its session id in place before
 * any of its messages can arrive, and rejected clients get `connect_error`.
 */
@WebSocketGateway({ namespace: PLAYBACK_SYNC_NAMESPACE })
export class PlaybackSyncGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() private namespace!: Namespace;
  private readonly lastStates = new Map<string, PlaybackState>();

  constructor(
    private readonly tokens: TokenService,
    private readonly rooms: SessionRoomsService,
  ) {}

  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      this.authorize(socket).then(
        () => next(),
        // Any failure — bad token, non-party, wrong service type, outside
        // the window — looks the same from outside.
        () => next(new Error('Unauthorized')),
      );
    });
  }

  handleConnection(client: Socket): void {
    const { sessionId } = client.data as SocketData;
    if (!sessionId) {
      // Unreachable when the middleware ran; defensive against misconfig.
      client.disconnect(true);
      return;
    }
    // Synchronous join: the room membership exists before the connect ack
    // reaches the client, so no peer message can slip past it.
    void client.join(roomOf(sessionId));
    const last = this.lastStates.get(sessionId);
    if (last) {
      client.emit(PLAYBACK_SYNC_EVENTS.state, last);
    }
  }

  handleDisconnect(client: Socket): void {
    const { sessionId } = client.data as SocketData;
    if (!sessionId) return;
    const room = this.namespace.adapter.rooms.get(roomOf(sessionId));
    if (!room || room.size === 0) {
      this.lastStates.delete(sessionId);
    }
  }

  @SubscribeMessage(PLAYBACK_SYNC_EVENTS.publish)
  publish(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): void {
    const { sessionId } = client.data as SocketData;
    if (!sessionId) return;
    const state = parseState(body);
    if (!state) return;
    const stamped: PlaybackState = { ...state, emittedAtMs: Date.now() };
    this.lastStates.set(sessionId, stamped);
    client.to(roomOf(sessionId)).emit(PLAYBACK_SYNC_EVENTS.state, stamped);
  }

  @SubscribeMessage(PLAYBACK_SYNC_EVENTS.requestState)
  requestState(@ConnectedSocket() client: Socket): void {
    const { sessionId } = client.data as SocketData;
    if (!sessionId) return;
    const last = this.lastStates.get(sessionId);
    if (last) {
      client.emit(PLAYBACK_SYNC_EVENTS.state, last);
    }
  }

  private async authorize(socket: Socket): Promise<void> {
    const user = this.authenticate(socket);
    const { sessionId } = socket.handshake
      .auth as Partial<PlaybackSyncHandshake>;
    if (typeof sessionId !== 'string' || sessionId === '') {
      throw new Error('Missing session id');
    }
    await this.rooms.authorizePlaybackSync(user, sessionId);
    (socket.data as SocketData).sessionId = sessionId;
  }

  private authenticate(client: Socket): AuthenticatedUser {
    const token = this.extractToken(client);
    if (!token) {
      throw new Error('Missing token');
    }
    const payload = this.tokens.verifyAccessToken(token);
    return { id: payload.sub, role: payload.role };
  }

  private extractToken(client: Socket): string | undefined {
    const header = client.handshake.headers.cookie;
    if (header) {
      const fromCookie = parseCookies(header)[ACCESS_TOKEN_COOKIE];
      if (fromCookie) return fromCookie;
    }
    // Same non-browser fallback as JwtAuthGuard's Bearer path.
    const { token } = client.handshake.auth as { token?: unknown };
    return typeof token === 'string' ? token : undefined;
  }
}
