import { ApiProperty } from '@nestjs/swagger';
import { LegalDocument } from '@playwithpro/shared';
import type { AcceptLegalRequest } from '@playwithpro/shared';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class AcceptedVersionDto {
  @ApiProperty({ enum: LegalDocument })
  @IsEnum(LegalDocument)
  document: LegalDocument;

  @ApiProperty({ example: '2026-09-18' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  version: string;
}

export class AcceptLegalDto implements AcceptLegalRequest {
  @ApiProperty({ type: [AcceptedVersionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AcceptedVersionDto)
  accepted: AcceptedVersionDto[];
}
