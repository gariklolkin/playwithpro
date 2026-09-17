import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { SessionResponse } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AcceptRescheduleDto,
  ProposeRescheduleDto,
} from './dto/reschedule.dto';
import { ReschedulesService } from './reschedules.service';

@ApiTags('bookings')
@Controller('sessions/:id/reschedule')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReschedulesController {
  constructor(private readonly reschedules: ReschedulesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      "Proposes a new time: 1–3 of the coach's open slots, held until the other party answers.",
  })
  async propose(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposeRescheduleDto,
  ): Promise<SessionResponse> {
    return this.reschedules.propose(user, id, dto.slotIds);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'The other party accepts one option; the session moves.',
  })
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptRescheduleDto,
  ): Promise<SessionResponse> {
    return this.reschedules.accept(user, id, dto.optionId);
  }

  @Post('decline')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'The other party declines; nothing changes.' })
  async decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionResponse> {
    return this.reschedules.decline(user, id);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'The proposer withdraws the proposal.' })
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionResponse> {
    return this.reschedules.withdraw(user, id);
  }
}
