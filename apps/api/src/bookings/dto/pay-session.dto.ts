import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PaySessionDto {
  /** Opaque payment-instrument token; omitted = provider default. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instrument?: string;
}
