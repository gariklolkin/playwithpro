import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONTACT_MAX_LENGTH,
  CREDENTIALS_MAX_LENGTH,
} from '@playwithpro/shared';
import type { SubmitVerificationRequest } from '@playwithpro/shared';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** At-least-one-contact is enforced in the service (cross-field rule). */
export class SubmitVerificationDto implements SubmitVerificationRequest {
  @ApiProperty({
    description: 'Free-text credentials: titles, ratings, coaching history.',
    maxLength: CREDENTIALS_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CREDENTIALS_MAX_LENGTH)
  credentials: string;

  @ApiPropertyOptional({ example: '@coach_ma' })
  @IsOptional()
  @IsString()
  @MaxLength(CONTACT_MAX_LENGTH)
  contactTelegram?: string;

  @ApiPropertyOptional({
    example: '+49 151 1234567',
    description: 'Doubles as WhatsApp.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTACT_MAX_LENGTH)
  contactPhone?: string;
}
