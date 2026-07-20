import { ApiProperty } from '@nestjs/swagger';
import type { SignVideoPartsRequest } from '@playwithpro/shared';
import { ArrayMaxSize, ArrayMinSize, IsInt, Max, Min } from 'class-validator';

/** S3 caps multipart uploads at 10 000 parts. */
const MAX_PART_NUMBER = 10_000;

export class SignVideoPartsDto implements SignVideoPartsRequest {
  @ApiProperty({ example: [1, 2, 3] })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_PART_NUMBER, { each: true })
  partNumbers: number[];
}
