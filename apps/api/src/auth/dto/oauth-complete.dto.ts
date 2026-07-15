import { ApiProperty } from '@nestjs/swagger';
import { SIGNUP_ROLES } from '@playwithpro/shared';
import type { OAuthCompleteRequest, SignupRole } from '@playwithpro/shared';
import { IsIn } from 'class-validator';

export class OAuthCompleteDto implements OAuthCompleteRequest {
  @ApiProperty({ enum: SIGNUP_ROLES })
  @IsIn(SIGNUP_ROLES)
  role: SignupRole;
}
