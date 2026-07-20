import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/url'),
}));

const sendMock = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual<object>('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: (...args: unknown[]) => sendMock(...args),
    })),
  };
});

const env: Record<string, string> = {
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET: 'bucket',
  S3_ENDPOINT: 'http://minio:9000',
  S3_PUBLIC_URL: 'http://localhost:9000',
};

describe('StorageService', () => {
  let service: StorageService;
  const signedUrlMock = getSignedUrl as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: { getOrThrow: (name: string) => env[name] },
        },
      ],
    }).compile();
    service = moduleRef.get(StorageService);
  });

  describe('createMultipartUpload', () => {
    it('returns the upload id from S3', async () => {
      sendMock.mockResolvedValue({ UploadId: 'upload-1' });

      const uploadId = await service.createMultipartUpload(
        'videos/u/v/original.mp4',
        'video/mp4',
      );

      expect(uploadId).toBe('upload-1');
      const command = sendMock.mock.calls[0][0] as {
        input: { Key: string; ContentType: string };
      };
      expect(command.input.Key).toBe('videos/u/v/original.mp4');
      expect(command.input.ContentType).toBe('video/mp4');
    });

    it('throws when S3 returns no upload id', async () => {
      sendMock.mockResolvedValue({});

      await expect(
        service.createMultipartUpload('k', 'video/mp4'),
      ).rejects.toThrow('no upload id');
    });
  });

  describe('presignUploadPart', () => {
    it('signs an UploadPart command with a 1 h default expiry', async () => {
      const url = await service.presignUploadPart('k', 'upload-1', 3);

      expect(url).toBe('https://signed.example/url');
      const [, command, options] = signedUrlMock.mock.calls[0] as [
        unknown,
        { input: { UploadId: string; PartNumber: number } },
        { expiresIn: number },
      ];
      expect(command.input.UploadId).toBe('upload-1');
      expect(command.input.PartNumber).toBe(3);
      expect(options.expiresIn).toBe(3600);
    });
  });

  describe('completeMultipartUpload', () => {
    it('sends parts sorted by part number', async () => {
      sendMock.mockResolvedValue({});

      await service.completeMultipartUpload('k', 'upload-1', [
        { partNumber: 2, etag: 'b' },
        { partNumber: 1, etag: 'a' },
      ]);

      const command = sendMock.mock.calls[0][0] as {
        input: {
          MultipartUpload: { Parts: { PartNumber: number; ETag: string }[] };
        };
      };
      expect(command.input.MultipartUpload.Parts).toEqual([
        { PartNumber: 1, ETag: 'a' },
        { PartNumber: 2, ETag: 'b' },
      ]);
    });
  });

  describe('abortMultipartUpload', () => {
    it('swallows S3 errors (best-effort cleanup)', async () => {
      sendMock.mockRejectedValue(new Error('gone'));

      await expect(
        service.abortMultipartUpload('k', 'upload-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('presignGet', () => {
    it('signs a plain GET for playback', async () => {
      await service.presignGet('k');

      const [, command] = signedUrlMock.mock.calls[0] as [
        unknown,
        { input: { ResponseContentDisposition?: string } },
      ];
      expect(command.input.ResponseContentDisposition).toBeUndefined();
    });

    it('forces attachment disposition for downloads', async () => {
      await service.presignGet('k', 300, 'моя игра.mp4');

      const [, command, options] = signedUrlMock.mock.calls[0] as [
        unknown,
        { input: { ResponseContentDisposition?: string } },
        { expiresIn: number },
      ];
      expect(command.input.ResponseContentDisposition).toContain('attachment');
      expect(command.input.ResponseContentDisposition).toContain(
        encodeURIComponent('моя игра.mp4'),
      );
      expect(options.expiresIn).toBe(300);
    });
  });
});
