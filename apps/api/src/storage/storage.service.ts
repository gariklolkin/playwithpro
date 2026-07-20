import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface StoredObjectHead {
  contentLength: number;
  contentType: string;
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
