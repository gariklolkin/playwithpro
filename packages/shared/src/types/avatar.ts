export const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const AVATAR_ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AvatarContentType = (typeof AVATAR_ALLOWED_CONTENT_TYPES)[number];

export interface AvatarUploadUrlRequest {
  contentType: AvatarContentType;
  /** Declared size; the server re-checks the real object on confirm. */
  sizeBytes: number;
}

export interface AvatarUploadUrlResponse {
  /** Pre-signed PUT URL; upload the file directly to storage, then confirm. */
  uploadUrl: string;
  key: string;
}

export interface ConfirmAvatarRequest {
  key: string;
}
