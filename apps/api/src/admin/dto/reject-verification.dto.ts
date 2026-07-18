import { ApiProperty } from '@nestjs/swagger';
import type { RejectVerificationRequest } from '@playwithpro/shared';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectVerificationDto implements RejectVerificationRequest {
  @ApiProperty({
    description: 'Reason shown to the coach. Required.',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note: string;
}
