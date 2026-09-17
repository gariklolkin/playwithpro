import type { UpdateNotificationPreferencesRequest } from '@playwithpro/shared';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto implements UpdateNotificationPreferencesRequest {
  @IsOptional()
  @IsBoolean()
  emailReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  emailClipChanges?: boolean;

  @IsOptional()
  @IsBoolean()
  emailReviews?: boolean;
}
