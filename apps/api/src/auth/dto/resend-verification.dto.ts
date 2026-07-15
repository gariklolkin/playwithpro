import { ApiProperty } from '@nestjs/swagger';
import { ResendVerificationRequest } from '@playwithpro/shared';
import { IsEmail } from 'class-validator';

export class ResendVerificationDto implements ResendVerificationRequest {
  @ApiProperty({ example: 'you@example.com' })
  @IsEmail()
  email: string;
}
