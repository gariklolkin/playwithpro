import { ApiProperty } from '@nestjs/swagger';
import {
  MODERATION_REASON_MAX_LENGTH,
  type DeleteReviewRequest,
} from '@playwithpro/shared';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteReviewDto implements DeleteReviewRequest {
  @ApiProperty({
    description: 'Moderation reason; required, logged server-side.',
    maxLength: MODERATION_REASON_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MODERATION_REASON_MAX_LENGTH)
  reason: string;
}
