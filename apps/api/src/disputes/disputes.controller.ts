import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AdminDisputeItem,
  AdminDisputeListResponse,
  DisputeKind,
  Role,
  SessionResponse,
} from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DisputesService } from './disputes.service';
import { DisputeResponseDto } from './dto/dispute-response.dto';
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
    return this.disputes.open(user, id, dto.category, dto.reason);
  }

  @Post('sessions/:id/dispute/response')
  @Roles(Role.Professional)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      "The coach's single statement on a system-opened dispute; cancels the automatic refund and leaves the case to an admin.",
  })
  async respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisputeResponseDto,
  ): Promise<SessionResponse> {
    return this.disputes.respond(user, id, dto.statement);
  }

  @Get('admin/disputes')
  @Roles(Role.Admin)
  @ApiOkResponse({
    description:
      'Open disputes oldest first; resolved newest first. Optional kind filter.',
  })
  async list(
    @Query('kind', new ParseEnumPipe(DisputeKind, { optional: true }))
    kind?: DisputeKind,
  ): Promise<AdminDisputeListResponse> {
    return this.disputes.listForAdmin(kind);
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
