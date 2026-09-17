import { ApiProperty } from '@nestjs/swagger';
import { CoachGameAnswer } from '@playwithpro/shared';
import type { ConfirmSessionRequest } from '@playwithpro/shared';
import { IsEnum, IsOptional } from 'class-validator';

export class ConfirmSessionDto implements ConfirmSessionRequest {
  @ApiProperty({
    enum: CoachGameAnswer,
    required: false,
    description:
      "The coach's answer for an in-person game (required for them, rejected otherwise).",
  })
  @IsOptional()
  @IsEnum(CoachGameAnswer)
  gameAnswer?: CoachGameAnswer;
}
