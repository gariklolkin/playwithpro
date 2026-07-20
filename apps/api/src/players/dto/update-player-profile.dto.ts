import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  Grip,
  Handedness,
  PLAYER_ABOUT_MAX_LENGTH,
  PlayerLevel,
  PlayingStyle,
} from '@playwithpro/shared';
import type { UpdatePlayerProfileRequest } from '@playwithpro/shared';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdatePlayerProfileDto implements UpdatePlayerProfileRequest {
  @ApiPropertyOptional({ enum: PlayerLevel })
  @IsOptional()
  @IsEnum(PlayerLevel)
  level?: PlayerLevel;

  @ApiPropertyOptional({ enum: PlayingStyle, nullable: true })
  @IsOptional()
  @IsEnum(PlayingStyle)
  style?: PlayingStyle | null;

  @ApiPropertyOptional({ example: 5, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  yearsOfExperience?: number | null;

  @ApiPropertyOptional({ enum: Handedness, nullable: true })
  @IsOptional()
  @IsEnum(Handedness)
  handedness?: Handedness | null;

  @ApiPropertyOptional({ enum: Grip, nullable: true })
  @IsOptional()
  @IsEnum(Grip)
  grip?: Grip | null;

  @ApiPropertyOptional({ example: 'Weekend league player from Berlin.' })
  @IsOptional()
  @IsString()
  @MaxLength(PLAYER_ABOUT_MAX_LENGTH)
  about?: string;
}
