import { ApiProperty } from '@nestjs/swagger';
import type {
  AvailabilityRuleInput,
  ReplaceAvailabilityRulesRequest,
} from '@playwithpro/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AvailabilityRuleDto implements AvailabilityRuleInput {
  @ApiProperty({ description: '0 = Monday … 6 = Sunday (ISO).' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @ApiProperty({ description: 'Minutes from local midnight; multiple of 30.' })
  @IsInt()
  @Min(0)
  @Max(23 * 60 + 30)
  startMinute: number;

  @ApiProperty({ description: 'Exclusive end; at least start + 60.' })
  @IsInt()
  @Min(60)
  @Max(24 * 60)
  endMinute: number;
}

export class ReplaceAvailabilityRulesDto implements ReplaceAvailabilityRulesRequest {
  @ApiProperty({ type: [AvailabilityRuleDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleDto)
  rules: AvailabilityRuleDto[];
}
