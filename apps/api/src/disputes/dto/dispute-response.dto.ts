import { ApiProperty } from '@nestjs/swagger';
import {
  COACH_RESPONSE_MAX_LENGTH,
  COACH_RESPONSE_MIN_LENGTH,
} from '@playwithpro/shared';
import type { DisputeResponseRequest } from '@playwithpro/shared';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DisputeResponseDto implements DisputeResponseRequest {
  @ApiProperty({
    description: "The coach's single statement on a system-opened dispute.",
    minLength: COACH_RESPONSE_MIN_LENGTH,
    maxLength: COACH_RESPONSE_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(COACH_RESPONSE_MIN_LENGTH)
  @MaxLength(COACH_RESPONSE_MAX_LENGTH)
  statement: string;
}
