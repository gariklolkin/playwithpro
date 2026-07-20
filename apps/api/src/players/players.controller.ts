import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  PlayerCardResponse,
  PlayerProfileResponse,
  Role,
} from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdatePlayerProfileDto } from './dto/update-player-profile.dto';
import { PlayersService } from './players.service';

@ApiTags('players')
@Controller('players')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get('me')
  @Roles(Role.Amateur)
  @ApiOkResponse({ description: 'Player profile (created lazily).' })
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlayerProfileResponse> {
    return this.players.getProfile(user.id);
  }

  @Patch('me')
  @Roles(Role.Amateur)
  @ApiOkResponse({ description: 'Player profile updated.' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePlayerProfileDto,
  ): Promise<PlayerProfileResponse> {
    return this.players.updateProfile(user.id, dto);
  }

  @Get(':id')
  @Roles(Role.Professional, Role.Admin)
  @ApiOkResponse({ description: 'Read-only player card for coaches/admins.' })
  async getPlayerCard(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PlayerCardResponse> {
    return this.players.getPlayerCard(id);
  }
}
