import { SESSION_VIDEO_NOTE_MAX_LENGTH } from '@playwithpro/shared';
import type { SessionVideoInput } from '@playwithpro/shared';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SessionVideoInputDto implements SessionVideoInput {
  @IsUUID()
  videoId: string;

  /** Player's hint for the coach; blank is stored as null. */
  @IsOptional()
  @IsString()
  @MaxLength(SESSION_VIDEO_NOTE_MAX_LENGTH)
  note?: string | null;
}
