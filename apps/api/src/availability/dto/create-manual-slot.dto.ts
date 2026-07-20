import { ApiProperty } from '@nestjs/swagger';
import type { CreateManualSlotRequest } from '@playwithpro/shared';
import { IsISO8601 } from 'class-validator';

export class CreateManualSlotDto implements CreateManualSlotRequest {
  @ApiProperty({ example: '2026-08-01T10:00:00.000Z' })
  @IsISO8601()
  startsAt: string;
}
