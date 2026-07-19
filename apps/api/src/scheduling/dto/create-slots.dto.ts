import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  ValidateNested,
} from 'class-validator';

export class SlotInputDto {
  @ApiProperty({ description: 'UTC instant, ISO 8601.' })
  @IsISO8601()
  startsAt: string;

  @ApiProperty({ description: 'UTC instant, ISO 8601.' })
  @IsISO8601()
  endsAt: string;
}

/** Concrete instants; recurring-pattern expansion happens in the admin UI. */
export class CreateSlotsDto {
  @ApiProperty({ type: [SlotInputDto], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SlotInputDto)
  slots: SlotInputDto[];
}
