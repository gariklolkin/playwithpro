import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MIN_LENGTH } from '@playwithpro/shared';
import type { ChangePasswordRequest } from '@playwithpro/shared';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto implements ChangePasswordRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  newPassword: string;
}
