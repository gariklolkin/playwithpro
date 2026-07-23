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
import { JoinRoomResponse, SessionRoomResponse } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { LeaveRoomDto } from './dto/leave-room.dto';
import { SessionRoomsService } from './session-rooms.service';

@ApiTags('session-rooms')
@Controller('sessions/:id/room')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionRoomsController {
  constructor(private readonly rooms: SessionRoomsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Room timing (always) and join descriptor (inside the window); parties only.',
  })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionRoomResponse> {
    return this.rooms.getRoom(user, id);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Attendance entry recorded for this join.' })
  async join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JoinRoomResponse> {
    return this.rooms.join(user, id);
  }

  @Post('leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveRoomDto,
  ): Promise<void> {
    await this.rooms.leave(user, id, dto.attendanceId);
  }
}
