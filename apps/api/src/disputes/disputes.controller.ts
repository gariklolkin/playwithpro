import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AdminDisputeItem,
  AdminDisputeListResponse,
  Role,
  SessionResponse,
} from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DisputesService } from './disputes.service';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

@ApiTags('disputes')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post('sessions/:id/dispute')
  @Roles(Role.Amateur)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Session disputed; payout frozen until an admin resolves.',
  })
  async open(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpenDisputeDto,
  ): Promise<SessionResponse> {
    return this.disputes.open(user, id, dto.reason);
  }

  @Get('admin/disputes')
  @Roles(Role.Admin)
  @ApiOkResponse({
    description: 'Open disputes oldest first; resolved newest first.',
  })
  async list(): Promise<AdminDisputeListResponse> {
    return this.disputes.listForAdmin();
  }

  @Post('admin/disputes/:id/resolve')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Dispute resolved; escrow released or refunded accordingly.',
  })
  async resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ): Promise<AdminDisputeItem> {
    return this.disputes.resolve(user.id, id, dto.outcome, dto.note);
  }
}
