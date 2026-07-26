/**
 * Synced playback for video-analysis session rooms: both parties' players
 * converge on a shared full-state snapshot relayed by the API (last writer
 * wins). The channel carries playback state only — never playback URLs or
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
