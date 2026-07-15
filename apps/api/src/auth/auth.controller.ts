import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthResponse } from '@playwithpro/shared';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import {
  clearAuthCookies,
  clearOAuthCookie,
  OAUTH_PENDING_COOKIE,
  OAUTH_STATE_COOKIE,
  REFRESH_TOKEN_COOKIE,
  setAuthCookies,
  setOAuthCookie,
} from './auth-cookies';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthCompleteDto } from './dto/oauth-complete.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { GoogleOAuthClient } from './google-oauth.client';
import { OAuthService } from './oauth.service';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly google: GoogleOAuthClient,
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

  @Get('google')
  googleStart(@Res() res: Response): void {
    const state = randomBytes(16).toString('base64url');
    setOAuthCookie(res, OAUTH_STATE_COOKIE, state, this.secureCookies());
    res.redirect(this.google.buildAuthUrl(state));
  }

  @Get('google/callback')
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ): Promise<void> {
    const secure = this.secureCookies();
    const expectedState = this.cookie(req, OAUTH_STATE_COOKIE);
    clearOAuthCookie(res, OAUTH_STATE_COOKIE, secure);

    if (!code || !state || !expectedState || state !== expectedState) {
      res.redirect(`${this.webAppUrl()}/login?error=google`);
      return;
    }

    try {
      const profile = await this.google.exchangeCode(code);
      const outcome = await this.oauth.handleGoogleCallback(profile);

      switch (outcome.kind) {
        case 'signed_in':
          setAuthCookies(res, outcome.result.tokens, secure);
          res.redirect(`${this.webAppUrl()}/dashboard`);
          return;
        case 'pending_signup':
          setOAuthCookie(
            res,
            OAUTH_PENDING_COOKIE,
            outcome.pendingToken,
            secure,
          );
          res.redirect(`${this.webAppUrl()}/oauth/complete`);
          return;
        case 'email_conflict':
          res.redirect(`${this.webAppUrl()}/login?error=google_email`);
          return;
      }
    } catch {
      res.redirect(`${this.webAppUrl()}/login?error=google`);
    }
  }

  @Post('oauth/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'First-time Google signup completed.' })
  async oauthComplete(
    @Body() dto: OAuthCompleteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, tokens } = await this.oauth.completeSignup(
      this.cookie(req, OAUTH_PENDING_COOKIE),
      dto.role,
    );
    clearOAuthCookie(res, OAUTH_PENDING_COOKIE, this.secureCookies());
    setAuthCookies(res, tokens, this.secureCookies());
    return { user };
  }

  private cookie(req: Request, name: string): string | undefined {
    const cookies = req.cookies as
      Record<string, string | undefined> | undefined;
    return cookies?.[name];
  }

  private webAppUrl(): string {
    return this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
  }

  private refreshCookie(req: Request): string | undefined {
    return this.cookie(req, REFRESH_TOKEN_COOKIE);
  }

  private secureCookies(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}
