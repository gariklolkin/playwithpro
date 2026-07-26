import { ApiProperty } from '@nestjs/swagger';
import { DisputeOutcome, ResolveDisputeRequest } from '@playwithpro/shared';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveDisputeDto implements ResolveDisputeRequest {
  @ApiProperty({
    enum: DisputeOutcome,
    description:
      'release pays the coach (minus fee); refund returns the money.',
  })
  @IsEnum(DisputeOutcome)
  outcome: DisputeOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
