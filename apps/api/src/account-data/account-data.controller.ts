import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  DeletionStatusResponse,
  ExportStatusResponse,
} from '@playwithpro/shared';
import type { Response } from 'express';
import { setAuthCookies } from '../auth/auth-cookies';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenService } from '../auth/token.service';
import { ConfigService } from '@nestjs/config';
import { AccountDeletionService } from './account-deletion.service';
import { AccountExportService } from './account-export.service';
import { RequestDeletionDto } from './dto/account-data.dto';

@ApiTags('users')
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class AccountDataController {
  constructor(
    private readonly deletion: AccountDeletionService,
    private readonly exports: AccountExportService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  @Get('deletion')
  @ApiOkResponse({
    description: 'Deletion schedule, blockers and the re-auth method.',
  })
  async deletionStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeletionStatusResponse> {
    return this.deletion.status(user.id);
  }

  @Post('deletion/code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOkResponse({
    description: 'Re-authentication code emailed (Google-only accounts).',
  })
  async sendCode(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.deletion.sendCode(user.id);
    return { ok: true };
  }

  @Post('deletion')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({
    description:
      'Deletion scheduled after the grace period; every other session is signed out, this one gets fresh cookies.',
  })
  async requestDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestDeletionDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DeletionStatusResponse> {
    const status = await this.deletion.request(user.id, dto);
    // The request revoked every refresh token; keep this browser signed in
    // so the grace screen (cancel, export) works without a new login.
    setAuthCookies(
      res,
      {
        accessToken: this.tokens.signAccessToken(user.id, user.role),
        refreshToken: await this.tokens.issueRefreshToken(user.id),
      },
      this.config.get<string>('NODE_ENV') === 'production',
    );
    return status;
  }

  @Delete('deletion')
  @ApiOkResponse({
    description: 'Deletion cancelled; the account is restored.',
  })
  async cancelDeletion(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeletionStatusResponse> {
    return this.deletion.cancel(user.id);
  }

  @Get('export')
  @ApiOkResponse({
    description: 'The latest export request and its download link.',
  })
  async exportStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExportStatusResponse> {
    return this.exports.status(user.id);
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOkResponse({ description: 'Export requested (one per 24 hours).' })
  async requestExport(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExportStatusResponse> {
    return this.exports.request(user.id);
  }
}
