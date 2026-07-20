import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AvatarUploadUrlResponse, MeResponse } from '@playwithpro/shared';
import type { Response } from 'express';
import { setAuthCookies } from '../auth/auth-cookies';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenService } from '../auth/token.service';
import { AvatarUploadUrlDto } from './dto/avatar-upload-url.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmAvatarDto } from './dto/confirm-avatar.dto';
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

  @Post('me/avatar/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Pre-signed PUT URL for the avatar upload.' })
  async createAvatarUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AvatarUploadUrlDto,
  ): Promise<AvatarUploadUrlResponse> {
    return this.users.createAvatarUploadUrl(user.id, dto);
  }

  @Put('me/avatar')
  @ApiOkResponse({ description: 'Avatar attached to the account.' })
  async confirmAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmAvatarDto,
  ): Promise<MeResponse> {
    return this.users.confirmAvatar(user.id, dto.key);
  }

  @Delete('me/avatar')
  @ApiOkResponse({ description: 'Avatar removed.' })
  async removeAvatar(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MeResponse> {
    return this.users.removeAvatar(user.id);
  }

  @Delete('me/oauth/google')
  @ApiOkResponse({ description: 'Google account unlinked.' })
  async unlinkGoogle(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MeResponse> {
    return this.users.unlinkGoogle(user.id);
  }
}
