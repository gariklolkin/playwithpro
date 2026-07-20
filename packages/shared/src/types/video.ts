import type { VideoRejectionReason, VideoStatus } from "../enums/video";

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
  createdAt: string;
}

export interface VideoListResponse {
  videos: VideoResponse[];
}

/** Short-lived pre-signed GET; expires, so never persist it client-side. */
export interface VideoUrlResponse {
  url: string;
  expiresInSeconds: number;
}
