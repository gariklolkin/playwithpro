import type { ServiceType } from "../enums/service-type";
import type { SessionStatus } from "../enums/session-status";

/** Vendor-agnostic descriptor of how to join the call. */
export type RoomDescriptor =
  | {
      kind: "embedded_jitsi";
      /** Bare host (https assumed) or full origin, e.g. http://localhost:8000. */
      domain: string;
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
  /** Attendance entry created for this join; pass back on leave. */
  attendanceId: string;
}

export interface LeaveRoomRequest {
  attendanceId: string;
}
