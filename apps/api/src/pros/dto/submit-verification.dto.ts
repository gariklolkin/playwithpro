import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CREDENTIALS_MAX_LENGTH,
  MAX_EVIDENCE_LINKS,
} from '@playwithpro/shared';
import type { SubmitVerificationRequest } from '@playwithpro/shared';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class SubmitVerificationDto implements SubmitVerificationRequest {
  @ApiProperty({
    description: 'Free-text credentials: titles, ratings, coaching history.',
    maxLength: CREDENTIALS_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CREDENTIALS_MAX_LENGTH)
  credentials: string;

  @ApiPropertyOptional({
    description: 'Evidence URLs: federation profile, rating page, press.',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EVIDENCE_LINKS)
  @IsUrl({ require_protocol: true }, { each: true })
  links?: string[];
}
