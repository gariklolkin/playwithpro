import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UpsertProServiceRequest } from '@playwithpro/shared';
import {
  IsBoolean,
  IsInt,
  IsNumber,
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

  @ApiPropertyOptional({ example: 'TTC Berlin Mitte, Brunnenstr. 1, Berlin' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  venueLabel?: string;

  @ApiPropertyOptional({ example: 52.53 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  venueLat?: number;

  @ApiPropertyOptional({ example: 13.4 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  venueLng?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
