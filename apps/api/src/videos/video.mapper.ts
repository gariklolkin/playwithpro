import type { Video } from '@prisma/client';
import {
  VideoRejectionReason,
  VideoResponse,
  VideoStatus,
} from '@playwithpro/shared';

const STATUS_MAP: Record<Video['status'], VideoStatus> = {
  UPLOADING: VideoStatus.Uploading,
  PROCESSING: VideoStatus.Processing,
  READY: VideoStatus.Ready,
  REJECTED: VideoStatus.Rejected,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface VideoResponseExtras {
  /** Retention of unattached ready videos; drives `expiresAt`. */
  retentionDays: number;
  /** Live upcoming sessions the video is attached to (owner view). */
  attachedUpcomingSessions: number;
}

export function toVideoResponse(
  video: Video,
  extras: VideoResponseExtras = {
    retentionDays: 0,
    attachedUpcomingSessions: 0,
  },
): VideoResponse {
  return {
    id: video.id,
    title: video.title,
    status: STATUS_MAP[video.status],
    // BigInt → number: file sizes are far below Number.MAX_SAFE_INTEGER
    sizeBytes: video.sizeBytes === null ? null : Number(video.sizeBytes),
    durationSeconds: video.durationSeconds,
    width: video.width,
    height: video.height,
    fps: video.fps,
    codec: video.codec,
    rejectionReason: (video.rejectionReason as VideoRejectionReason) ?? null,
    expiresAt:
      video.status === 'READY' && video.unattachedSince !== null
        ? new Date(
            video.unattachedSince.getTime() + extras.retentionDays * DAY_MS,
          ).toISOString()
        : null,
    attachedUpcomingSessions: extras.attachedUpcomingSessions,
    createdAt: video.createdAt.toISOString(),
  };
}
