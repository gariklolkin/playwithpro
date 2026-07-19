import { ApiPropertyOptional } from '@nestjs/swagger';
import { CREDENTIALS_MAX_LENGTH } from '@playwithpro/shared';
import type { SubmitVerificationRequest } from '@playwithpro/shared';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** The reviewed material is the profile itself; extra notes are optional. */
export class SubmitVerificationDto implements SubmitVerificationRequest {
  @ApiPropertyOptional({
    description: 'Optional extra notes: titles, ratings, coaching history.',
    maxLength: CREDENTIALS_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CREDENTIALS_MAX_LENGTH)
  credentials?: string;
}
