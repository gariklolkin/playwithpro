import { ApiProperty } from '@nestjs/swagger';
import { CANCELLATION_REASON_MAX_LENGTH } from '@playwithpro/shared';
import type { AdminCancelSessionRequest } from '@playwithpro/shared';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminCancelSessionDto implements AdminCancelSessionRequest {
  @ApiProperty({
    description:
      'Why the session is cancelled as force majeure (injury, venue closed, platform outage). Required.',
    maxLength: CANCELLATION_REASON_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(CANCELLATION_REASON_MAX_LENGTH)
  reason: string;
}
