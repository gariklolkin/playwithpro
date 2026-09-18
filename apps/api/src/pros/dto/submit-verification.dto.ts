import { ApiProperty } from '@nestjs/swagger';
import type { SubmitVerificationRequest } from '@playwithpro/shared';
import { IsString, Matches } from 'class-validator';
import { LEGAL_VERSION_PATTERN } from '../../auth/dto/register.dto';

export class SubmitVerificationDto implements SubmitVerificationRequest {
  @ApiProperty({
    example: '2026-09-18',
    description:
      'The coach agreement version accepted on the card (must be current).',
  })
  @IsString()
  @Matches(LEGAL_VERSION_PATTERN)
  coachAgreementVersion: string;
}
