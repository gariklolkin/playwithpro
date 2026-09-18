import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Locale, SIGNUP_ROLES } from '@playwithpro/shared';
import type { OAuthCompleteRequest, SignupRole } from '@playwithpro/shared';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
} from 'class-validator';
import { LEGAL_VERSION_PATTERN } from './register.dto';

export class OAuthCompleteDto implements OAuthCompleteRequest {
  @ApiProperty({ enum: SIGNUP_ROLES })
  @IsIn(SIGNUP_ROLES)
  role: SignupRole;

  @ApiPropertyOptional({ example: 'Europe/Berlin' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiProperty({ example: '2026-09-18' })
  @IsString()
  @Matches(LEGAL_VERSION_PATTERN)
  acceptedTerms: string;

  @ApiProperty({ example: '2026-09-18' })
  @IsString()
  @Matches(LEGAL_VERSION_PATTERN)
  acceptedPrivacy: string;

  @ApiPropertyOptional({ enum: Locale })
  @IsOptional()
  @IsEnum(Locale)
  locale?: string;
}
