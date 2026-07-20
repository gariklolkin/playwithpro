import { ServiceType } from '@playwithpro/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

/** Accepts both repeated params (?a=x&a=y) and comma lists (?a=x,y). */
const toList = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value.split(',').filter((item) => item.length > 0)
    : value;

export class CatalogQueryDto {
  /** ISO 639-1 spoken languages (any-of). */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsString({ each: true })
  @Length(2, 2, { each: true })
  languages?: string[];

  /** Service types (any-of). */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsEnum(ServiceType, { each: true })
  serviceTypes?: ServiceType[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
