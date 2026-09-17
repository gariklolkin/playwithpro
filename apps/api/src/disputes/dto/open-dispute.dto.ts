import { ApiProperty } from '@nestjs/swagger';
import {
  DISPUTE_REASON_MAX_LENGTH,
  DisputeReasonCategory,
} from '@playwithpro/shared';
import type { OpenDisputeRequest } from '@playwithpro/shared';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class OpenDisputeDto implements OpenDisputeRequest {
  @ApiProperty({
    enum: DisputeReasonCategory,
    description: 'Why the player is contesting the session. Required.',
  })
  @IsEnum(DisputeReasonCategory)
  category: DisputeReasonCategory;

  @ApiProperty({
    required: false,
    description: 'Free text; required only for the "other" category.',
    maxLength: DISPUTE_REASON_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: OpenDisputeDto) =>
      dto.category === DisputeReasonCategory.Other ||
      (dto.reason !== undefined && dto.reason !== ''),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(DISPUTE_REASON_MAX_LENGTH)
  reason?: string;
}
