import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthResponse } from '@playwithpro/shared';
import type { Request, Response } from 'express';
import {
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
  setAuthCookies,
} from './auth-cookies';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  @ApiOkResponse({ description: 'Account created and signed in.' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, tokens } = await this.auth.register(dto);
    setAuthCookies(res, tokens, this.secureCookies());
    return { user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  @ApiOkResponse({ description: 'Signed in; auth cookies set.' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, tokens } = await this.auth.login(dto);
    setAuthCookies(res, tokens, this.secureCookies());
    return { user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Tokens rotated; fresh cookies set.' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, tokens } = await this.auth.refresh(this.refreshCookie(req));
    setAuthCookies(res, tokens, this.secureCookies());
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.refreshCookie(req));
    clearAuthCookies(res, this.secureCookies());
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ ok: true }> {
    await this.auth.verifyEmail(dto.token);
    return { ok: true };
  }

  @Post('email/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ ok: true }> {
    await this.auth.resendVerification(dto.email);
    return { ok: true };
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.auth.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  private refreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as
      Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_TOKEN_COOKIE];
  }

  private secureCookies(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}
