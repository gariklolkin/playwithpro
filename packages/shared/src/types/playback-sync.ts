/**
 * Synced playback for video-analysis session rooms: both parties' players
 * converge on a shared full-state snapshot relayed by the API (last writer
 * wins), plus video annotations. The channel never carries playback URLs or
 * room slugs.
 */

/** socket.io namespace served by the API for playback sync. */
export const PLAYBACK_SYNC_NAMESPACE = "/playback-sync";

/** Seconds a synced player may deviate from the shared position before snapping. */
export const PLAYBACK_DRIFT_THRESHOLD_SECONDS = 2;

/** Interval at which the last commander re-asserts a playing state. */
export const PLAYBACK_HEARTBEAT_INTERVAL_MS = 5_000;

/** Handshake payload (socket.io `auth`) identifying the session room. */
export interface PlaybackSyncHandshake {
  sessionId: string;
}

/** Full snapshot of the shared player state. */
export interface PlaybackState {
  playing: boolean;
  positionSeconds: number;
  /**
   * Server receive time (ms epoch), stamped on relay; clients use it only as
   * a delta against later server stamps, never against their own clock.
   */
  emittedAtMs: number;
}

export const PLAYBACK_SYNC_EVENTS = {
  /** client → server: local gesture or heartbeat snapshot to share. */
  publish: "playback:publish",
  /** client → server: ask for the current shared state (re-attach/catch-up). */
  requestState: "playback:request-state",
  /** server → client: the shared state to conform to. */
  state: "playback:state",
} as const;

// ---------------------------------------------------------------------------
// Video annotations (video-analysis rooms). Strokes ride the same channel as
// playback state, under the same party-only, window-scoped authorization.
// ---------------------------------------------------------------------------

export type AnnotationTool = "pen" | "line" | "angle";

/** Point normalized to the video's content box: 0..1, origin top-left. */
export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface Stroke {
  /** Client-minted UUID; the server ignores duplicates. */
  id: string;
  /** Video moment the stroke belongs to — see `momentKeyOf`. */
  momentKey: string;
  /** Set by the server from the sending socket's user; client values ignored. */
  authorId: string;
  tool: AnnotationTool;
  /** CSS hex color, e.g. `#2563eb`. */
  color: string;
  /**
   * `pen`: the sampled path; `line`: `[from, to]`; `angle`: `[a, vertex, b]`
   * (the degree label is computed on render, never transmitted).
   */
  points: AnnotationPoint[];
  createdAtMs: number;
}

/** All annotations of a session: moment key → strokes in arrival order. */
export type AnnotationState = Record<string, Stroke[]>;

export const ANNOTATION_EVENTS = {
  /** client → server: a complete stroke to store and relay. */
  add: "annotation:add",
  /** client → server: remove the sender's latest stroke on a moment. */
  undo: "annotation:undo",
  /** client → server: empty a moment for everyone. */
  clear: "annotation:clear",
  /** client → server: ask for the full annotation state (catch-up). */
  requestState: "annotation:request-state",
  /** server → client: the full annotation state. */
  state: "annotation:state",
  /** server → client: a stroke was added. */
  added: "annotation:added",
  /** server → client: a stroke was removed (undo). */
  removed: "annotation:removed",
  /** server → client: a moment was emptied. */
  cleared: "annotation:cleared",
} as const;

export interface AnnotationUndoPayload {
  momentKey: string;
}

export interface AnnotationClearPayload {
  momentKey: string;
}

export interface AnnotationRemovedPayload {
  momentKey: string;
  strokeId: string;
}

export interface AnnotationClearedPayload {
  momentKey: string;
}

/** Server-enforced caps; messages beyond them are dropped silently. */
export const ANNOTATION_LIMITS = {
  pointsPerStroke: 200,
  strokesPerMoment: 100,
  momentsPerSession: 50,
  /** Length cap on the moment key and color strings. */
  maxKeyLength: 16,
} as const;

/** Points a stroke of each tool must carry (min, max). */
export const ANNOTATION_POINT_COUNTS: Record<
  AnnotationTool,
  { min: number; max: number }
> = {
  pen: { min: 1, max: ANNOTATION_LIMITS.pointsPerStroke },
  line: { min: 2, max: 2 },
  angle: { min: 3, max: 3 },
};

/** Moment keys resolve to a tenth of a second. */
export const MOMENT_RESOLUTION_SECONDS = 0.1;

/** A paused player within this distance of a moment shows its strokes. */
export const MOMENT_TOLERANCE_SECONDS = 0.15;

/** Default stroke colors by role: coach blue, player orange. */
export const ANNOTATION_ROLE_COLORS = {
  professional: "#2563eb",
  amateur: "#ea580c",
} as const;

/** Small palette offered beside the role default. */
export const ANNOTATION_PALETTE = [
  "#2563eb",
  "#ea580c",
  "#16a34a",
  "#dc2626",
  "#facc15",
  "#ffffff",
] as const;

/** Position in seconds → moment key, e.g. `134.23` → `"134.2"`. */
export function momentKeyOf(positionSeconds: number): string {
  const safe = Number.isFinite(positionSeconds)
    ? Math.max(0, positionSeconds)
    : 0;
  return (
    Math.round(safe / MOMENT_RESOLUTION_SECONDS) * MOMENT_RESOLUTION_SECONDS
  ).toFixed(1);
}

/** Moment key → position in seconds; NaN for a malformed key. */
export function momentSecondsOf(momentKey: string): number {
  return Number(momentKey);
}

/** True when a strict moment key string was produced by `momentKeyOf`. */
export function isMomentKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= ANNOTATION_LIMITS.maxKeyLength &&
    /^\d+\.\d$/.test(value)
  );
}
