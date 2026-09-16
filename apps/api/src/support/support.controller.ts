import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { SupportIdentityResponse } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SupportService } from './support.service';

@ApiTags('support')
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('identity')
  @ApiOkResponse({
    description:
      'Verified support identity (user id + HMAC) for the signed-in user.',
  })
  @ApiNotFoundResponse({ description: 'Support channel is not configured.' })
  identity(@CurrentUser() user: AuthenticatedUser): SupportIdentityResponse {
    return this.support.identityFor(user.id);
  }
}
