import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  REVIEWS_PAGE_SIZE,
  ReviewListResponse,
  SessionResponse,
} from '@playwithpro/shared';
import {
  DisputeOutcome,
  Prisma,
  ProProfileStatus,
  SessionStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { BookingsService } from '../bookings/bookings.service';
import { SessionProgressionService } from '../bookings/session-progression.service';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly progression: SessionProgressionService,
  ) {}

  /**
   * One review per paid-out session. Eligibility is judged on session status
   * only — never on the payment row, which may lag HELD while a payout retry
   * is pending. The unique sessionId constraint is the one-review invariant;
   * the aggregate increment rides the same transaction so it cannot drift.
   */
  async create(
    user: AuthenticatedUser,
    sessionId: string,
    dto: CreateReviewDto,
  ): Promise<SessionResponse> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        playerId: true,
        proProfileId: true,
        status: true,
        startsAt: true,
        endsAt: true,
        proProfile: { select: { userId: true } },
        dispute: { select: { outcome: true } },
      },
    });
    if (
      !session ||
      (session.playerId !== user.id && session.proProfile.userId !== user.id)
    ) {
      throw new NotFoundException();
    }
    if (session.playerId !== user.id) {
      throw new ForbiddenException('Only the player can leave a review.');
    }
    // Persist the clock-derived status first so a session past its
    // auto-confirm deadline is reviewable without waiting for the sweep.
    const normalized = await this.progression.normalize(session);
    if (!this.paidOut(normalized.status, session.dispute?.outcome ?? null)) {
      throw new ConflictException('This session cannot be reviewed.');
    }
    try {
      await this.prisma.$transaction([
        this.prisma.review.create({
          data: {
            sessionId: session.id,
            proProfileId: session.proProfileId,
            playerId: session.playerId,
            rating: dto.rating,
            text: dto.text?.trim() || null,
          },
        }),
        this.prisma.proProfile.update({
          where: { id: session.proProfileId },
          data: {
            ratingSum: { increment: dto.rating },
            ratingCount: { increment: 1 },
          },
        }),
      ]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This session is already reviewed.');
      }
      throw error;
    }
    this.logger.log(`Review created for session ${session.id}`);
    return this.bookings.sessionResponse(session.id);
  }

  /** Public, verified-coach-only reviews page, newest first. */
  async listPublic(proId: string, page: number): Promise<ReviewListResponse> {
    const profile = await this.prisma.proProfile.findUnique({
      where: { id: proId },
      select: { status: true },
    });
    if (!profile || profile.status !== ProProfileStatus.VERIFIED) {
      throw new NotFoundException();
    }
    const [total, reviews] = await this.prisma.$transaction([
      this.prisma.review.count({ where: { proProfileId: proId } }),
      this.prisma.review.findMany({
        where: { proProfileId: proId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * REVIEWS_PAGE_SIZE,
        take: REVIEWS_PAGE_SIZE,
        select: {
          id: true,
          rating: true,
          text: true,
          createdAt: true,
          player: { select: { displayName: true } },
          session: { select: { serviceType: true, startsAt: true } },
        },
      }),
    ]);
    return {
      items: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        text: review.text,
        playerDisplayName: review.player.displayName,
        serviceType: toSharedServiceType(review.session.serviceType),
        sessionDate: review.session.startsAt.toISOString(),
        createdAt: review.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize: REVIEWS_PAGE_SIZE,
    };
  }

  private paidOut(
    status: SessionStatus,
    disputeOutcome: DisputeOutcome | null,
  ): boolean {
    return (
      status === SessionStatus.COMPLETED_PAID ||
      (status === SessionStatus.RESOLVED &&
        disputeOutcome === DisputeOutcome.RELEASE)
    );
  }
}
