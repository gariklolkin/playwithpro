import type {
  UploadRefusalReason,
  VideoRejectionReason,
  VideoStatus,
} from "../enums/video";

/** Part size the client should slice with (also the server-side hint). */
export const VIDEO_PART_SIZE_BYTES = 8 * 1024 * 1024;

export const VIDEO_TITLE_MAX_LENGTH = 200;

export interface CreateVideoUploadRequest {
  fileName: string;
  contentType: string;
  /** Declared size; re-checked against the stored object on complete. */
  sizeBytes: number;
}

export interface CreateVideoUploadResponse {
  videoId: string;
  uploadId: string;
  key: string;
  partSizeBytes: number;
}

export interface SignVideoPartsRequest {
  partNumbers: number[];
}

export interface SignVideoPartsResponse {
  urls: { partNumber: number; url: string }[];
}

export interface CompletedVideoPart {
  partNumber: number;
  etag: string;
}

export interface CompleteVideoUploadRequest {
  parts: CompletedVideoPart[];
}

export interface RenameVideoRequest {
  title: string;
}

export interface VideoResponse {
  id: string;
  title: string;
  status: VideoStatus;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  rejectionReason: VideoRejectionReason | null;
  /**
   * When the retention sweep will delete this ready video unless it gets
   * attached to a live session; null while attached or not ready.
   */
  expiresAt: string | null;
  /** Live (not cancelled) upcoming sessions this video is attached to; owner view only. */
  attachedUpcomingSessions: number;
  createdAt: string;
}

/** Platform limits the client shows before the player hits them. */
export interface VideoLimits {
  file: { maxSizeBytes: number; maxDurationSeconds: number };
  session: { maxClips: number; maxTotalSeconds: number };
  library: {
    maxBytes: number;
    maxVideos: number;
    usedBytes: number;
    count: number;
  };
}

export interface VideoListResponse {
  videos: VideoResponse[];
  limits: VideoLimits;
}

/** Body of the 409 when upload initiation would exceed the library quota. */
export interface UploadRefusal {
  reason: UploadRefusalReason;
  remainingBytes: number;
  maxVideos: number;
}

/** Short-lived pre-signed GET; expires, so never persist it client-side. */
export interface VideoUrlResponse {
  url: string;
  expiresInSeconds: number;
}
