import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { LegalStatusResponse, PlatformFacts } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AcceptLegalDto } from './dto/accept-legal.dto';
import { LegalService } from './legal.service';
import { requestLocale } from './request-locale';

@ApiTags('legal')
@Controller()
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('platform-facts')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOkResponse({
    description: 'Operator and policy facts the legal texts reference.',
  })
  facts(): PlatformFacts {
    return this.legal.facts();
  }

  @Get('legal/status')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({
    description:
      'Documents the user must accept again, and newer minor versions.',
  })
  async status(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LegalStatusResponse> {
    return this.legal.status(user.id);
  }

  @Post('legal/accept')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Current versions accepted; new status.' })
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptLegalDto,
    @Headers('x-locale') localeHeader: string | undefined,
  ): Promise<LegalStatusResponse> {
    return this.legal.accept(
      user.id,
      dto.accepted,
      requestLocale(localeHeader),
    );
  }
}
