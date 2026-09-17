import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  NotificationPreferencesResponse,
  UnsubscribeResponse,
} from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UnsubscribeDto } from './dto/unsubscribe.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { verifyUnsubscribeToken } from './unsubscribe-token';

const PREFERENCE_SELECT = {
  emailReminders: true,
  emailClipChanges: true,
  emailReviews: true,
} as const;

@ApiTags('notifications')
@Controller()
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('users/me/notifications')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({
    description: 'Optional email categories of the signed-in user.',
  })
  async preferences(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationPreferencesResponse> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: PREFERENCE_SELECT,
    });
  }

  @Patch('users/me/notifications')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Preferences updated.' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponse> {
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailReminders: dto.emailReminders,
        emailClipChanges: dto.emailClipChanges,
        emailReviews: dto.emailReviews,
      },
      select: PREFERENCE_SELECT,
    });
  }

  /**
   * One-click unsubscribe (RFC 8058): no sign-in, the signed token names
   * the account and the single optional category it turns off.
   */
  @Post('notifications/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ description: 'The category named by the token is now off.' })
  async unsubscribe(@Body() dto: UnsubscribeDto): Promise<UnsubscribeResponse> {
    const claims = verifyUnsubscribeToken(
      this.config.getOrThrow<string>('NOTIFY_UNSUBSCRIBE_SECRET'),
      dto.token,
    );
    if (!claims) {
      throw new BadRequestException(
        'This unsubscribe link is invalid or expired.',
      );
    }
    await this.prisma.user.updateMany({
      where: { id: claims.userId },
      data: { [claims.category]: false },
    });
    return { category: claims.category };
  }
}
