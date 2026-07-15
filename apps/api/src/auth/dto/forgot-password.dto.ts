import { ApiProperty } from '@nestjs/swagger';
import { ForgotPasswordRequest } from '@playwithpro/shared';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto implements ForgotPasswordRequest {
  @ApiProperty({ example: 'you@example.com' })
  @IsEmail()
  email: string;
}
