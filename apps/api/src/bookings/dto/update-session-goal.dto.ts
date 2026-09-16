import { SESSION_GOAL_MAX_LENGTH } from '@playwithpro/shared';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

/** `{ goal: null }` clears it; whitespace-only text is treated as empty. */
export class UpdateSessionGoalDto {
  @ValidateIf((dto: UpdateSessionGoalDto) => dto.goal !== null)
  @IsString()
  @MaxLength(SESSION_GOAL_MAX_LENGTH)
  goal: string | null;
}
