import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MIN_LENGTH, ResetPasswordRequest } from '@playwithpro/shared';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto implements ResetPasswordRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password: string;
}
