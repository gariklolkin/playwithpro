import type { ServiceType } from "../enums/service-type";
import type { SessionStatus } from "../enums/session-status";

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
  /** Attached video (video_analysis only), playable via the signed playback URL. */
  videoId: string | null;
  videoTitle: string | null;
  /** Localized display name of the other party. */
  counterpartName: string;
}

export interface JoinRoomResponse {
  /** Attendance entry created for this join (connect/leave times arrive via provider webhooks). */
  attendanceId: string;
  /** Short-lived participant token scoped to this session's room. */
  token: string;
}
