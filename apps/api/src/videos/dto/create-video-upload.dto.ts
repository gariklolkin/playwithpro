import { ApiProperty } from '@nestjs/swagger';
import type { CreateVideoUploadRequest } from '@playwithpro/shared';
import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateVideoUploadDto implements CreateVideoUploadRequest {
  @ApiProperty({ example: 'match-2026-07-20.mp4' })
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 'video/mp4' })
  @IsString()
  @Matches(/^video\//, { message: 'contentType must be a video MIME type' })
  contentType: string;

  @ApiProperty({ description: 'Declared file size in bytes.' })
  @IsInt()
  @Min(1)
  sizeBytes: number;
}
