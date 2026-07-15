import { ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_LOCALES } from '@playwithpro/shared';
import type { UpdateMeRequest } from '@playwithpro/shared';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
} from 'class-validator';

export class UpdateMeDto implements UpdateMeRequest {
  @ApiPropertyOptional({ example: 'Garik L.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;

  @ApiPropertyOptional({ example: 'Europe/Berlin' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
