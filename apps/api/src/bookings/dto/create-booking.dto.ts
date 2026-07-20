import { ServiceType } from '@playwithpro/shared';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateBookingDto {
  /** ProProfile id of the coach. */
  @IsUUID()
  proId: string;

  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @IsUUID()
  slotId: string;

  /** Required for video_analysis, forbidden otherwise. */
  @IsOptional()
  @IsUUID()
  videoId?: string;
}
