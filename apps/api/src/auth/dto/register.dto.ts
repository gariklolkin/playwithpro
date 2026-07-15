import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MIN_LENGTH, SIGNUP_ROLES } from '@playwithpro/shared';
import type { RegisterRequest, SignupRole } from '@playwithpro/shared';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto implements RegisterRequest {
  @ApiProperty({ example: 'you@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password: string;

  @ApiProperty({ example: 'Garik L.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  displayName: string;

  @ApiProperty({ enum: SIGNUP_ROLES })
  @IsIn(SIGNUP_ROLES)
  role: SignupRole;
}
