import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ADMIN_REVIEWS_PAGE_SIZE,
  AdminReviewListResponse,
} from '@playwithpro/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminReviewsQueryDto } from './dto/admin-reviews-query.dto';

@Injectable()
export class AdminReviewsService {
  private readonly logger = new Logger(AdminReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminReviewsQueryDto): Promise<AdminReviewListResponse> {
    const page = query.page ?? 1;
    const search = query.query?.trim();
    const where: Prisma.ReviewWhereInput = search
      ? {
          OR: [
            {
              proProfile: {
                user: {
                  displayName: { contains: search, mode: 'insensitive' },
                },
              },
            },
            {
              player: {
                displayName: { contains: search, mode: 'insensitive' },
              },
            },
          ],
        }
      : {};
    const [total, reviews] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * ADMIN_REVIEWS_PAGE_SIZE,
        take: ADMIN_REVIEWS_PAGE_SIZE,
        include: {
          player: { select: { displayName: true } },
          proProfile: {
            select: { user: { select: { displayName: true } } },
          },
        },
      }),
    ]);
    return {
      items: reviews.map((review) => ({
        id: review.id,
        sessionId: review.sessionId,
        proProfileId: review.proProfileId,
        rating: review.rating,
        text: review.text,
        coachDisplayName: review.proProfile.user.displayName,
        playerDisplayName: review.player.displayName,
        createdAt: review.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize: ADMIN_REVIEWS_PAGE_SIZE,
    };
  }

  /**
   * Hard delete plus aggregate decrement in one transaction — the delete
   * goes first, so a repeated request 404s before touching the aggregate
   * and a double decrement is impossible.
   */
  async remove(id: string, reason: string, adminId: string): Promise<void> {
    await this.prisma
      .$transaction(async (tx) => {
        const review = await tx.review.delete({
          where: { id },
          select: { rating: true, proProfileId: true, sessionId: true },
        });
        await tx.proProfile.update({
          where: { id: review.proProfileId },
          data: {
            ratingSum: { decrement: review.rating },
            ratingCount: { decrement: 1 },
          },
        });
        return review;
      })
      .then((review) => {
        // No moderation table in MVP: the structured log is the record.
        this.logger.log(
          `Review ${id} (session ${review.sessionId}) deleted by admin ${adminId}: ${reason}`,
        );
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          throw new NotFoundException();
        }
        throw error;
      });
  }
}
