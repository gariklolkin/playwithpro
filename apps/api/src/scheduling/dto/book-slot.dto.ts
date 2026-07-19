import { ApiProperty } from '@nestjs/swagger';
import type { BookSlotRequest } from '@playwithpro/shared';
import { IsUUID } from 'class-validator';

export class BookSlotDto implements BookSlotRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  slotId: string;
}
