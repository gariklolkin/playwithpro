import { ApiProperty } from '@nestjs/swagger';
import { RESCHEDULE_MAX_OPTIONS } from '@playwithpro/shared';
import type {
  AcceptRescheduleRequest,
  ProposeRescheduleRequest,
} from '@playwithpro/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

export class ProposeRescheduleDto implements ProposeRescheduleRequest {
  @ApiProperty({
    description:
      "1–3 of the coach's open slots, same duration as the booked one.",
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RESCHEDULE_MAX_OPTIONS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  slotIds: string[];
}

export class AcceptRescheduleDto implements AcceptRescheduleRequest {
  @ApiProperty({ description: 'The offered option to move the session to.' })
  @IsUUID()
  optionId: string;
}
