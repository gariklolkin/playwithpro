import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { MeResponse } from '@playwithpro/shared';
import type { Response } from 'express';
import { setAuthCookies } from '../auth/auth-cookies';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenService } from '../auth/token.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  @Get('me')
  @ApiOkResponse({ description: 'Current user profile.' })
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.users.getMe(user.id);
  }

  @Patch('me')
  @ApiOkResponse({ description: 'Profile basics updated.' })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMeDto,
  ): Promise<MeResponse> {
    return this.users.updateMe(user.id, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Password changed; other sessions revoked.',
  })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.users.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    // Keep the calling session alive: it gets a fresh token pair while the
    // revocation above logged out every other session.
    setAuthCookies(
      res,
      {
        accessToken: this.tokens.signAccessToken(user.id, user.role),
        refreshToken: await this.tokens.issueRefreshToken(user.id),
      },
      this.config.get<string>('NODE_ENV') === 'production',
    );
    return { ok: true };
  }

  @Delete('me/oauth/google')
  @ApiOkResponse({ description: 'Google account unlinked.' })
  async unlinkGoogle(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MeResponse> {
    return this.users.unlinkGoogle(user.id);
  }
}
