import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccountRequestItem, Role } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccountDeletionService } from './account-deletion.service';
import { AccountRequestsService } from './account-requests.service';
import { AdminDeleteUserDto } from './dto/account-data.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminAccountDataController {
  constructor(
    private readonly deletion: AccountDeletionService,
    private readonly requests: AccountRequestsService,
  ) {}

  @Post('users/:id/deletion')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Deletion scheduled on behalf of the user (reason recorded).',
  })
  async deleteUser(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminDeleteUserDto,
  ): Promise<{ ok: true }> {
    await this.deletion.requestByAdmin(admin.id, id, dto.reason, dto.graceDays);
    return { ok: true };
  }

  @Get('account-requests')
  @ApiOkResponse({ description: 'Deletion and export requests, newest first.' })
  async list(
    @Query('userId', new ParseUUIDPipe({ optional: true })) userId?: string,
  ): Promise<AdminAccountRequestItem[]> {
    return this.requests.list(userId);
  }

  @Post('account-requests/:id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'A failed request re-run; done steps skipped.',
  })
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminAccountRequestItem> {
    return this.requests.retry(id);
  }
}
