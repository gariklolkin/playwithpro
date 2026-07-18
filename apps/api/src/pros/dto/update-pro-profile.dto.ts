import { ApiPropertyOptional } from '@nestjs/swagger';
import { BIO_MAX_LENGTH, SUPPORTED_LOCALES } from '@playwithpro/shared';
import type { UpdateProProfileRequest } from '@playwithpro/shared';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateProProfileDto implements UpdateProProfileRequest {
  @ApiPropertyOptional({ maxLength: BIO_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(BIO_MAX_LENGTH)
  bio?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SUPPORTED_LOCALES.length)
  @IsIn(SUPPORTED_LOCALES, { each: true })
  languages?: string[];
}
