import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { LEGAL_VERSION_PATTERN } from '../../auth/dto/register.dto';

export class PaySessionDto {
  /** Opaque payment-instrument token; omitted = provider default. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instrument?: string;

  /** The booking-policy version shown at checkout; must be current when given. */
  @IsOptional()
  @IsString()
  @Matches(LEGAL_VERSION_PATTERN)
  bookingPolicyVersion?: string;
}
