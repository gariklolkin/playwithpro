import { ApiProperty } from '@nestjs/swagger';
import type {
  CompletedVideoPart,
  CompleteVideoUploadRequest,
} from '@playwithpro/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class CompletedVideoPartDto implements CompletedVideoPart {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  partNumber: number;

  @ApiProperty()
  @IsString()
  etag: string;
}

export class CompleteVideoUploadDto implements CompleteVideoUploadRequest {
  @ApiProperty({ type: [CompletedVideoPartDto] })
  @ArrayMinSize(1)
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => CompletedVideoPartDto)
  parts: CompletedVideoPartDto[];
}
