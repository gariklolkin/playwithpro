import { ApiProperty } from '@nestjs/swagger';
import { LoginRequest } from '@playwithpro/shared';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto implements LoginRequest {
  @ApiProperty({ example: 'you@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}
