import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Locale, PASSWORD_MIN_LENGTH, SIGNUP_ROLES } from '@playwithpro/shared';
import type { RegisterRequest, SignupRole } from '@playwithpro/shared';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Registry versions are `YYYY-MM-DD`. */
export const LEGAL_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class RegisterDto implements RegisterRequest {
  @ApiProperty({ example: 'you@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password: string;

  @ApiProperty({ example: 'Garik L.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  displayName: string;

  @ApiProperty({ enum: SIGNUP_ROLES })
  @IsIn(SIGNUP_ROLES)
  role: SignupRole;

  @ApiPropertyOptional({ example: 'Europe/Berlin' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiProperty({
    example: '2026-09-18',
    description: 'The terms version accepted on the form (must be current).',
  })
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
