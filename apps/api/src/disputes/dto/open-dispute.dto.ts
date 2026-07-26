import { ApiProperty } from '@nestjs/swagger';
import type { OpenDisputeRequest } from '@playwithpro/shared';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OpenDisputeDto implements OpenDisputeRequest {
  @ApiProperty({
    description: 'Why the player is contesting the session. Required.',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}
