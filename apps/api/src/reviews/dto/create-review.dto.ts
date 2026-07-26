import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateReviewRequest } from '@playwithpro/shared';
import {
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
  REVIEW_TEXT_MAX_LENGTH,
} from '@playwithpro/shared';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto implements CreateReviewRequest {
  @ApiProperty({
    description: 'Star rating.',
    minimum: REVIEW_RATING_MIN,
    maximum: REVIEW_RATING_MAX,
  })
  @IsInt()
  @Min(REVIEW_RATING_MIN)
  @Max(REVIEW_RATING_MAX)
  rating: number;

  @ApiPropertyOptional({
    description: 'Optional review text.',
    maxLength: REVIEW_TEXT_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(REVIEW_TEXT_MAX_LENGTH)
  text?: string;
}
