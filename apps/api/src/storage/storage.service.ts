import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';

export interface StoredObjectHead {
  contentLength: number;
  contentType: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/**
 * Thin wrapper over S3-compatible storage (MinIO locally, AWS S3 in prod).
 * Pre-signed URLs are signed against S3_PUBLIC_URL so browser uploads work
 * even though the API reaches MinIO via the in-cluster endpoint.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly internalClient: S3Client;
  private readonly signingClient: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    const region = config.getOrThrow<string>('S3_REGION');
    const credentials = {
      accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
      secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
    };
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.publicUrl = config
      .getOrThrow<string>('S3_PUBLIC_URL')
      .replace(/\/$/, '');
    this.internalClient = new S3Client({
      region,
      credentials,
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
      forcePathStyle: true, // required by MinIO
    });
    this.signingClient = new S3Client({
      region,
      credentials,
      endpoint: this.publicUrl,
      forcePathStyle: true,
    });
  }

  /** Pre-signed PUT URL pinned to the given content type. */
  async presignPut(
    key: string,
    contentType: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Starts an S3 multipart upload; returns the upload id. */
  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const result = await this.internalClient.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!result.UploadId) {
      throw new Error('S3 returned no upload id');
    }
    return result.UploadId;
  }

  /**
   * Pre-signed URL for one part of a multipart upload. Expiry is generous
   * (1 h) because a single part may crawl over a slow mobile link; the
   * client re-requests a signature when one lapses.
   */
  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds = 3600,
  ): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Finalizes a multipart upload from the client-reported part etags. */
  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.internalClient.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
        },
      }),
    );
  }

  /** Best-effort abort; failures are logged, never thrown. */
  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.internalClient.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to abort multipart upload ${key}: ${String(error)}`,
      );
    }
  }

  /**
   * Pre-signed GET for streaming or download. Passing `downloadFilename`
   * forces a file download under that name instead of inline playback.
   */
  async presignGet(
    key: string,
    expiresInSeconds = 3600,
    downloadFilename?: string,
  ): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(downloadFilename
          ? {
              ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
            }
          : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  /**
   * Pre-signed GET against the in-cluster endpoint, for server-side tools
   * (ffprobe/ffmpeg) that cannot reach the browser-facing URL. SigV4 pins
   * the host, so the public-endpoint variant would fail inside the cluster.
   */
  async presignGetInternal(
    key: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    return getSignedUrl(
      this.internalClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Server-side upload (worker renditions); body length must be known. */
  async putObject(
    key: string,
    body: Readable,
    contentType: string,
    contentLength: number,
  ): Promise<void> {
    await this.internalClient.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
    );
  }

  /** Returns null when the object does not exist. */
  async headObject(key: string): Promise<StoredObjectHead | null> {
    try {
      const head = await this.internalClient.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentLength: head.ContentLength ?? 0,
        contentType: head.ContentType ?? '',
      };
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') return null;
      throw error;
    }
  }

  /** Best-effort delete; failures are logged, never thrown. */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.internalClient.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(`Failed to delete object ${key}: ${String(error)}`);
    }
  }

  /** Public download URL (bucket has anonymous read for public content). */
  objectUrl(key: string): string {
    return `${this.publicUrl}/${this.bucket}/${key}`;
  }
}
