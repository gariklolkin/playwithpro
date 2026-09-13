import type { UpdateSessionVideosRequest } from '@playwithpro/shared';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { SessionVideoInputDto } from './session-video-input.dto';

export class UpdateSessionVideosDto implements UpdateSessionVideosRequest {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionVideoInputDto)
  videos: SessionVideoInputDto[];
}
