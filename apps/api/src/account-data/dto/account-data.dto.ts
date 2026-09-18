import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { ACCOUNT_DELETION_REASON_MAX_LENGTH } from '@playwithpro/shared';
import type {
  AdminDeleteUserRequest,
  RequestDeletionRequest,
} from '@playwithpro/shared';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RequestDeletionDto implements RequestDeletionRequest {
  @ApiPropertyOptional({ description: 'Current password (password accounts).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @ApiPropertyOptional({
    description: 'Six-digit emailed code (Google-only accounts).',
  })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  code?: string;
}

export class AdminDeleteUserDto implements AdminDeleteUserRequest {
  @ApiProperty({ maxLength: ACCOUNT_DELETION_REASON_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(ACCOUNT_DELETION_REASON_MAX_LENGTH)
  reason: string;

  @ApiPropertyOptional({ description: '0 executes on the next job tick.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  graceDays?: number;
}
