import { ApiProperty } from '@nestjs/swagger';
import type { ConfirmAvatarRequest } from '@playwithpro/shared';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmAvatarDto implements ConfirmAvatarRequest {
  @ApiProperty({ example: 'avatars/<userId>/<uuid>.png' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  key: string;
}
