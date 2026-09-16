import type { ServiceType } from "../enums/service-type";
import type { SessionStatus } from "../enums/session-status";
import type { SessionVideoItem } from "./booking";
import type { PlayerCardResponse } from "./player-profile";

/**
 * Minutes before `endsAt` at which the in-call reminder fires. A shared
 * constant (no per-user setting in the MVP) so a future server-side push
 * uses the same lead time as the web countdown.
 */
export const CALL_TIME_REMINDER_BEFORE_END_MIN = 10;

/**
 * Vendor-tagged descriptor of where the call lives. Carries no capability:
 * admission needs the participant token returned by the join action.
 */
export type RoomDescriptor =
  | {
      kind: "livekit";
      /** Public signaling URL for the browser SDK, e.g. wss://meet.example. */
      url: string;
      roomName: string;
    }
  | {
      /** Future Meet-style providers: nothing embedded, just a URL. */
      kind: "external_url";
      url: string;
    };

export interface SessionRoomResponse {
  sessionId: string;
  status: SessionStatus;
  serviceType: ServiceType;
  startsAt: string;
  endsAt: string;
  /** Join window bounds; the room is joinable between them. */
  opensAt: string;
  closesAt: string;
  /** Null outside the join window — the page shows a countdown/closed state. */
  room: RoomDescriptor | null;
  /** Attached clips in order (video_analysis only), each playable via its signed playback URL. */
  videos: SessionVideoItem[];
  /** Localized display name of the other party. */
  counterpartName: string;
  /** The player's goal for the session; both parties. */
  goal: string | null;
  /** The player's card for the coach viewer only (paid-session rule); null otherwise. */
  playerContext: PlayerCardResponse | null;
  /**
   * The API's clock when the response was built. Remaining-time displays and
   * reminders derive from `serverNow − Date.now()` at receipt, never from the
   * client clock alone.
   */
  serverNow: string;
}

export interface JoinRoomResponse {
  /** Attendance entry created for this join (connect/leave times arrive via provider webhooks). */
  attendanceId: string;
  /** Short-lived participant token scoped to this session's room. */
  token: string;
}
