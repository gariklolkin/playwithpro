import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminReviewListResponse, Role } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminReviewsService } from './admin-reviews.service';
import { AdminReviewsQueryDto } from './dto/admin-reviews-query.dto';
import { DeleteReviewDto } from './dto/delete-review.dto';

@ApiTags('admin')
@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminReviewsController {
  constructor(private readonly reviews: AdminReviewsService) {}

  @Get()
  @ApiOkResponse({
    description: 'All reviews, newest first, searchable and paginated.',
  })
  async list(
    @Query() query: AdminReviewsQueryDto,
  ): Promise<AdminReviewListResponse> {
    return this.reviews.list(query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Review removed; the coach rating aggregate is decremented in the same transaction.',
  })
  async remove(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteReviewDto,
  ): Promise<{ ok: true }> {
    await this.reviews.remove(id, dto.reason.trim(), admin.id);
    return { ok: true };
  }
}
