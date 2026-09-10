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
  ANNOTATION_EVENTS,
  ANNOTATION_LIMITS,
  ANNOTATION_POINT_COUNTS,
  AnnotationClearedPayload,
  AnnotationPoint,
  AnnotationRemovedPayload,
  AnnotationState,
  AnnotationTool,
  isMomentKey,
  PLAYBACK_SYNC_EVENTS,
  PLAYBACK_SYNC_NAMESPACE,
  PlaybackState,
  PlaybackSyncHandshake,
  Stroke,
} from '@playwithpro/shared';
import type { Namespace, Socket } from 'socket.io';
import { ACCESS_TOKEN_COOKIE, AuthenticatedUser } from '../auth/auth-cookies';
import { TokenService } from '../auth/token.service';
import { SessionRoomsService } from './session-rooms.service';

interface SocketData {
  sessionId?: string;
  userId?: string;
}

/** Per-session annotation store: moment key → strokes in arrival order. */
type AnnotationStore = Map<string, Stroke[]>;

const ANNOTATION_TOOLS: readonly AnnotationTool[] = ['pen', 'line', 'angle'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const UUID_LIKE = /^[0-9a-f-]{16,36}$/i;

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

function parsePoint(value: unknown): AnnotationPoint | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y } = value as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/**
 * Untrusted `annotation:add` payload → stroke minus the server-set author,
 * or null to drop it. Shape and per-stroke limits only; per-moment and
 * per-session caps are checked against the store.
 */
function parseStroke(body: unknown): Omit<Stroke, 'authorId'> | null {
  if (typeof body !== 'object' || body === null) return null;
  const { id, momentKey, tool, color, points, createdAtMs } = body as Record<
    string,
    unknown
  >;
  if (typeof id !== 'string' || !UUID_LIKE.test(id)) return null;
  if (!isMomentKey(momentKey)) return null;
  if (typeof tool !== 'string' || !ANNOTATION_TOOLS.includes(tool as never)) {
    return null;
  }
  if (typeof color !== 'string' || !HEX_COLOR.test(color)) return null;
  if (!Array.isArray(points)) return null;
  const { min, max } = ANNOTATION_POINT_COUNTS[tool as AnnotationTool];
  if (points.length < min || points.length > max) return null;
  const parsed: AnnotationPoint[] = [];
  for (const raw of points) {
    const point = parsePoint(raw);
    if (!point) return null;
    parsed.push(point);
  }
  const stamp =
    typeof createdAtMs === 'number' && Number.isFinite(createdAtMs)
      ? createdAtMs
      : Date.now();
  return {
    id,
    momentKey,
    tool: tool as AnnotationTool,
    color: color.toLowerCase(),
    points: parsed,
    createdAtMs: stamp,
  };
}

function parseMomentKey(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { momentKey } = body as Record<string, unknown>;
  return isMomentKey(momentKey) ? momentKey : null;
}

function toAnnotationState(store: AnnotationStore): AnnotationState {
  return Object.fromEntries(store);
}

/**
 * Relay for shared playback state and video annotations in video-analysis
 * rooms. Holds no truth
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
  /** Ephemeral annotation state per session; same lifecycle as lastStates. */
  private readonly annotations = new Map<string, AnnotationStore>();

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
    this.sendAnnotationState(client, sessionId);
  }

  handleDisconnect(client: Socket): void {
    const { sessionId } = client.data as SocketData;
    if (!sessionId) return;
    const room = this.namespace.adapter.rooms.get(roomOf(sessionId));
    if (!room || room.size === 0) {
      this.lastStates.delete(sessionId);
      this.annotations.delete(sessionId);
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

  @SubscribeMessage(ANNOTATION_EVENTS.add)
  addAnnotation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): void {
    const { sessionId, userId } = client.data as SocketData;
    if (!sessionId || !userId) return;
    const parsed = parseStroke(body);
    if (!parsed) return;
    const store =
      this.annotations.get(sessionId) ?? new Map<string, Stroke[]>();
    const strokes = store.get(parsed.momentKey) ?? [];
    if (
      !store.has(parsed.momentKey) &&
      store.size >= ANNOTATION_LIMITS.momentsPerSession
    ) {
      return;
    }
    if (strokes.length >= ANNOTATION_LIMITS.strokesPerMoment) return;
    if (strokes.some((stroke) => stroke.id === parsed.id)) return;
    const stroke: Stroke = { ...parsed, authorId: userId };
    strokes.push(stroke);
    store.set(parsed.momentKey, strokes);
    this.annotations.set(sessionId, store);
    client.to(roomOf(sessionId)).emit(ANNOTATION_EVENTS.added, stroke);
  }

  @SubscribeMessage(ANNOTATION_EVENTS.undo)
  undoAnnotation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): void {
    const { sessionId, userId } = client.data as SocketData;
    if (!sessionId || !userId) return;
    const momentKey = parseMomentKey(body);
    if (!momentKey) return;
    const store = this.annotations.get(sessionId);
    const strokes = store?.get(momentKey);
    if (!store || !strokes) return;
    const index = strokes.map((s) => s.authorId).lastIndexOf(userId);
    if (index === -1) return;
    const [removed] = strokes.splice(index, 1);
    if (strokes.length === 0) store.delete(momentKey);
    const payload: AnnotationRemovedPayload = {
      momentKey,
      strokeId: removed.id,
    };
    // Echo to the sender too: the optimistic local removal is confirmed by
    // the same event the peer sees, so both sides converge on the store.
    this.namespace
      .to(roomOf(sessionId))
      .emit(ANNOTATION_EVENTS.removed, payload);
  }

  @SubscribeMessage(ANNOTATION_EVENTS.clear)
  clearAnnotations(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): void {
    const { sessionId } = client.data as SocketData;
    if (!sessionId) return;
    const momentKey = parseMomentKey(body);
    if (!momentKey) return;
    const store = this.annotations.get(sessionId);
    if (!store?.delete(momentKey)) return;
    const payload: AnnotationClearedPayload = { momentKey };
    this.namespace
      .to(roomOf(sessionId))
      .emit(ANNOTATION_EVENTS.cleared, payload);
  }

  @SubscribeMessage(ANNOTATION_EVENTS.requestState)
  requestAnnotationState(@ConnectedSocket() client: Socket): void {
    const { sessionId } = client.data as SocketData;
    if (!sessionId) return;
    this.sendAnnotationState(client, sessionId);
  }

  private sendAnnotationState(client: Socket, sessionId: string): void {
    const store = this.annotations.get(sessionId);
    if (!store || store.size === 0) return;
    client.emit(ANNOTATION_EVENTS.state, toAnnotationState(store));
  }

  private async authorize(socket: Socket): Promise<void> {
    const user = this.authenticate(socket);
    const { sessionId } = socket.handshake
      .auth as Partial<PlaybackSyncHandshake>;
    if (typeof sessionId !== 'string' || sessionId === '') {
      throw new Error('Missing session id');
    }
    await this.rooms.authorizePlaybackSync(user, sessionId);
    const data = socket.data as SocketData;
    data.sessionId = sessionId;
    data.userId = user.id;
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
