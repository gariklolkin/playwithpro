import { ApiProperty } from '@nestjs/swagger';
import {
  AVATAR_ALLOWED_CONTENT_TYPES,
  AVATAR_MAX_SIZE_BYTES,
} from '@playwithpro/shared';
import type {
  AvatarContentType,
  AvatarUploadUrlRequest,
} from '@playwithpro/shared';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export class AvatarUploadUrlDto implements AvatarUploadUrlRequest {
  @ApiProperty({ enum: AVATAR_ALLOWED_CONTENT_TYPES })
  @IsIn(AVATAR_ALLOWED_CONTENT_TYPES)
  contentType: AvatarContentType;

  @ApiProperty({ example: 1048576, maximum: AVATAR_MAX_SIZE_BYTES })
  @IsInt()
  @Min(1)
  @Max(AVATAR_MAX_SIZE_BYTES)
  sizeBytes: number;
}
