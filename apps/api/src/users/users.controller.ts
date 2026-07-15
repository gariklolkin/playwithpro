import { Controller, Delete, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { MeResponse } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Delete('me/oauth/google')
  @ApiOkResponse({ description: 'Google account unlinked.' })
  async unlinkGoogle(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MeResponse> {
    return this.users.unlinkGoogle(user.id);
  }
}
