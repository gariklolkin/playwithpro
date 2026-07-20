import type { Video } from '@prisma/client';
import { VideoRejectionReason, VideoResponse, VideoStatus } from '@playwithpro/shared';

const STATUS_MAP: Record<Video['status'], VideoStatus> = {
  UPLOADING: VideoStatus.Uploading,
  PROCESSING: VideoStatus.Processing,
  READY: VideoStatus.Ready,
  REJECTED: VideoStatus.Rejected,
};

export function toVideoResponse(video: Video): VideoResponse {
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
    createdAt: video.createdAt.toISOString(),
  };
}
