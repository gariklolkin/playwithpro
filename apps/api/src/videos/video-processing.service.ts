import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VideoRejectionReason } from '@playwithpro/shared';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const execFileAsync = promisify(execFile);

/** ffprobe output, reduced to what the pipeline decides on. */
export interface ProbeResult {
  hasVideoStream: boolean;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  container: string | null;
}

/**
 * In-process video pipeline: probe → (maybe) transcode → ready.
 * Deliberately queue-less for MVP: the DB status machine is the source of
 * truth, so moving this into a real worker later only changes the executor.
 */
@Injectable()
export class VideoProcessingService implements OnModuleInit {
  private readonly logger = new Logger(VideoProcessingService.name);
  private readonly queue: string[] = [];
  private active = 0;
  /** ffmpeg is CPU-hungry; keep the API responsive. */
  private readonly concurrency = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  /** Re-queue videos orphaned in PROCESSING by a restart. */
  async onModuleInit(): Promise<void> {
    const stuck = await this.prisma.video.findMany({
      where: { status: 'PROCESSING' },
      select: { id: true },
    });
    for (const video of stuck) {
      this.logger.log(`Recovering interrupted processing for ${video.id}`);
      this.enqueue(video.id);
    }
  }

  enqueue(videoId: string): void {
    this.queue.push(videoId);
    this.drain();
  }

  private drain(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const videoId = this.queue.shift() as string;
      this.active += 1;
      void this.run(videoId).finally(() => {
        this.active -= 1;
        this.drain();
      });
    }
  }

  private async run(videoId: string): Promise<void> {
    try {
      await this.process(videoId);
    } catch (error) {
      this.logger.error(`Processing ${videoId} failed: ${String(error)}`);
      await this.prisma.video
        .update({
          where: { id: videoId, status: 'PROCESSING' },
          data: {
            status: 'REJECTED',
            rejectionReason: VideoRejectionReason.ProcessingFailed,
          },
        })
        .catch(() => undefined);
    }
  }

  private async process(videoId: string): Promise<void> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!video || video.status !== 'PROCESSING') return;

    const sourceUrl = await this.storage.presignGetInternal(video.originalKey);
    const probe = await this.probe(sourceUrl);

    if (!probe.hasVideoStream) {
      await this.reject(
        videoId,
        video.originalKey,
        VideoRejectionReason.NotAVideo,
      );
      return;
    }
    const maxDurationSeconds =
      this.config.getOrThrow<number>('VIDEO_MAX_DURATION_MIN') * 60;
    if (probe.durationSeconds > maxDurationSeconds) {
      await this.reject(
        videoId,
        video.originalKey,
        VideoRejectionReason.TooLong,
      );
      return;
    }

    await this.prisma.video.update({
      where: { id: videoId },
      data: {
        durationSeconds: Math.round(probe.durationSeconds),
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        codec: probe.codec,
        container: probe.container,
      },
    });

    const playbackKey = this.isBrowserSafe(probe, video.originalKey)
      ? video.originalKey
      : await this.transcode(video.ownerId, videoId, sourceUrl);

    await this.prisma.video.update({
      where: { id: videoId },
      data: { status: 'READY', playbackKey },
    });
    this.logger.log(`Video ${videoId} is ready (playback: ${playbackKey})`);
  }

  /** H.264 in an .mp4 plays everywhere; anything else gets a rendition. */
  private isBrowserSafe(probe: ProbeResult, originalKey: string): boolean {
    return probe.codec === 'h264' && originalKey.toLowerCase().endsWith('.mp4');
  }

  private async reject(
    videoId: string,
    originalKey: string,
    reason: VideoRejectionReason,
  ): Promise<void> {
    await this.storage.deleteObject(originalKey);
    await this.prisma.video.update({
      where: { id: videoId },
      data: { status: 'REJECTED', rejectionReason: reason },
    });
    this.logger.warn(`Video ${videoId} rejected: ${reason}`);
  }

  /** Probes over HTTP; ffprobe range-reads, no full download needed. */
  private async probe(sourceUrl: string): Promise<ProbeResult> {
    let raw: string;
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          sourceUrl,
        ],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      raw = stdout;
    } catch {
      // ffprobe exits non-zero for files it cannot parse at all.
      return {
        hasVideoStream: false,
        durationSeconds: 0,
        width: null,
        height: null,
        fps: null,
        codec: null,
        container: null,
      };
    }
    const parsed = JSON.parse(raw) as {
      format?: { duration?: string; format_name?: string };
      streams?: {
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        r_frame_rate?: string;
      }[];
    };
    const videoStream = (parsed.streams ?? []).find(
      (stream) => stream.codec_type === 'video',
    );
    return {
      hasVideoStream: Boolean(videoStream),
      durationSeconds: Number(parsed.format?.duration ?? 0),
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      fps: parseFrameRate(
        videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate,
      ),
      codec: videoStream?.codec_name ?? null,
      container: parsed.format?.format_name ?? null,
    };
  }

  /**
   * H.264/AAC MP4 rendition: long side capped at 1920 (works for portrait
   * footage too), source fps preserved, faststart for instant playback.
   */
  private async transcode(
    ownerId: string,
    videoId: string,
    sourceUrl: string,
  ): Promise<string> {
    const workDir = await mkdtemp(join(tmpdir(), 'video-transcode-'));
    const outputPath = join(workDir, 'playback.mp4');
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-i',
          sourceUrl,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '22',
          '-vf',
          "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'",
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          outputPath,
        ],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      const playbackKey = `videos/${ownerId}/${videoId}/playback.mp4`;
      const { size } = await stat(outputPath);
      await this.storage.putObject(
        playbackKey,
        createReadStream(outputPath),
        'video/mp4',
        size,
      );
      return playbackKey;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  /** Abandoned uploads leave multipart garbage in S3; sweep daily. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweepStaleUploads(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await this.prisma.video.findMany({
      where: { status: 'UPLOADING', createdAt: { lt: cutoff } },
    });
    for (const video of stale) {
      if (video.s3UploadId) {
        await this.storage.abortMultipartUpload(
          video.originalKey,
          video.s3UploadId,
        );
      }
      await this.prisma.video.delete({ where: { id: video.id } });
      this.logger.log(`Swept stale upload ${video.id}`);
    }
  }
}

function parseFrameRate(rate: string | undefined): number | null {
  if (!rate) return null;
  const [numerator, denominator] = rate.split('/').map(Number);
  if (!numerator || !denominator) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}
