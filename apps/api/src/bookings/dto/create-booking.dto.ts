import { SESSION_GOAL_MAX_LENGTH, ServiceType } from '@playwithpro/shared';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SessionVideoInputDto } from './session-video-input.dto';

export class CreateBookingDto {
  /** ProProfile id of the coach. */
  @IsUUID()
  proId: string;

  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @IsUUID()
  slotId: string;

  /**
   * Ordered clip set: required (non-empty, within the caps) for
   * video_analysis, forbidden otherwise. The service validates the rules.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionVideoInputDto)
  videos?: SessionVideoInputDto[];

  /** Optional "what should we focus on?"; trimmed, empty = none. */
  @IsOptional()
  @IsString()
  @MaxLength(SESSION_GOAL_MAX_LENGTH)
  goal?: string | null;
}
