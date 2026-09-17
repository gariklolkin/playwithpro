import type { UnsubscribeRequest } from '@playwithpro/shared';
import { IsString, MaxLength } from 'class-validator';

export class UnsubscribeDto implements UnsubscribeRequest {
  @IsString()
  @MaxLength(512)
  token: string;
}
