import { ApiProperty } from '@nestjs/swagger';
import { VerifyEmailRequest } from '@playwithpro/shared';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto implements VerifyEmailRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}
