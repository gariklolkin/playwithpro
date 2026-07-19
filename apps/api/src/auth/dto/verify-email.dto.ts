import { ApiProperty } from '@nestjs/swagger';
import { EMAIL_CODE_LENGTH, VerifyEmailRequest } from '@playwithpro/shared';
import { IsEmail, Length, Matches } from 'class-validator';

export class VerifyEmailDto implements VerifyEmailRequest {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'The emailed 6-digit confirmation code.' })
  @Length(EMAIL_CODE_LENGTH, EMAIL_CODE_LENGTH)
  @Matches(/^\d+$/)
  code: string;
}
