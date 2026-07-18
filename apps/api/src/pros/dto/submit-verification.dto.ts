import { ApiProperty } from '@nestjs/swagger';
import {
  CONTACT_MAX_LENGTH,
  CREDENTIALS_MAX_LENGTH,
} from '@playwithpro/shared';
import type { SubmitVerificationRequest } from '@playwithpro/shared';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SubmitVerificationDto implements SubmitVerificationRequest {
  @ApiProperty({
    description: 'Free-text credentials: titles, ratings, coaching history.',
    maxLength: CREDENTIALS_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CREDENTIALS_MAX_LENGTH)
  credentials: string;

  @ApiProperty({
    description:
      'Messenger/phone where the admin can reach the coach for a short identity video call.',
    maxLength: CONTACT_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CONTACT_MAX_LENGTH)
  contact: string;
}
