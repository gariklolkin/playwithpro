import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UpsertProServiceRequest } from '@playwithpro/shared';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertProServiceDto implements UpsertProServiceRequest {
  @ApiProperty({ description: 'Hourly price in integer minor units (cents).' })
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  priceMinor: number;

  @ApiProperty({ example: 'EUR', description: 'ISO 4217 code.' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency: string;

  @ApiPropertyOptional({ example: 'Berlin' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  venueCity?: string;

  @ApiPropertyOptional({ example: 'TTC Berlin Mitte' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  venueClub?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
