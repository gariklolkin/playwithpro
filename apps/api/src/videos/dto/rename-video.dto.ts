import { ApiProperty } from '@nestjs/swagger';
import { VIDEO_TITLE_MAX_LENGTH } from '@playwithpro/shared';
import type { RenameVideoRequest } from '@playwithpro/shared';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RenameVideoDto implements RenameVideoRequest {
  @ApiProperty({ maxLength: VIDEO_TITLE_MAX_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(VIDEO_TITLE_MAX_LENGTH)
  title: string;
}
