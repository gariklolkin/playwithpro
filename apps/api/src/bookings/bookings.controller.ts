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
  PaySessionResponse,
  Role,
  SessionListResponse,
  SessionResponse,
} from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaySessionDto } from './dto/pay-session.dto';

@ApiTags('bookings')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('bookings')
  @Roles(Role.Amateur)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Slot claimed; session created in pending_payment.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ): Promise<SessionResponse> {
    return this.bookings.create(user.id, dto);
  }

  @Get('sessions')
  @ApiOkResponse({ description: 'Own sessions, split into upcoming and past.' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionListResponse> {
    return this.bookings.list(user);
  }

  @Get('sessions/:id')
  @ApiOkResponse({ description: 'Session detail (parties and admins only).' })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionResponse> {
    return this.bookings.get(user, id);
  }

  @Post('sessions/:id/pay')
  @Roles(Role.Amateur)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Escrow hold attempted; session paid on success.',
  })
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaySessionDto,
  ): Promise<PaySessionResponse> {
    return this.bookings.pay(user.id, id, dto);
  }
}
