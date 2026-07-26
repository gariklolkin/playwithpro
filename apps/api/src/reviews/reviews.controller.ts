import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ReviewListResponse, Role, SessionResponse } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('sessions/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Amateur)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Review stored and the coach aggregate updated; session returned with it.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ): Promise<SessionResponse> {
    return this.reviews.create(user, id, dto);
  }

  @Get('pros/:proId/reviews')
  @ApiOkResponse({
    description: "A verified coach's reviews, newest first, paginated.",
  })
  async list(
    @Param('proId', ParseUUIDPipe) proId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ): Promise<ReviewListResponse> {
    return this.reviews.listPublic(proId, Math.max(page, 1));
  }
}
