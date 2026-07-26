import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ADMIN_USERS_PAGE_SIZE,
  AdminSessionCounts,
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListResponse,
  PlayerLevel as SharedPlayerLevel,
  ProProfileStatus as SharedProProfileStatus,
  SessionStatus as SharedSessionStatus,
} from '@playwithpro/shared';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaRole, toSharedRole } from '../users/user.mapper';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminUsersQueryDto): Promise<AdminUserListResponse> {
    const page = query.page ?? 1;
    const search = query.query?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: toPrismaRole(query.role) } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * ADMIN_USERS_PAGE_SIZE,
        take: ADMIN_USERS_PAGE_SIZE,
      }),
    ]);
    return {
      items: users.map((user) => this.toListItem(user)),
      total,
      page,
      pageSize: ADMIN_USERS_PAGE_SIZE,
    };
  }

  async detail(id: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        playerProfile: { select: { level: true } },
        proProfile: {
          select: { status: true, ratingSum: true, ratingCount: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException();
    }
    // Sessions on either side of the table: as the player or as the coach.
    const partyFilter: Prisma.SessionWhereInput = {
      OR: [{ playerId: id }, { proProfile: { userId: id } }],
    };
    const [sessionGroups, paymentAttempts] = await Promise.all([
      this.prisma.session.groupBy({
        by: ['status'],
        where: partyFilter,
        _count: { _all: true },
      }),
      this.prisma.payment.count({ where: { session: partyFilter } }),
    ]);
    const sessionCounts: AdminSessionCounts = {};
    for (const group of sessionGroups) {
      sessionCounts[group.status.toLowerCase() as SharedSessionStatus] =
        group._count._all;
    }
    return {
      ...this.toListItem(user),
      locale: user.locale,
      timezone: user.timezone,
      playerProfile: user.playerProfile
        ? {
            level: user.playerProfile.level.toLowerCase() as SharedPlayerLevel,
          }
        : null,
      proProfile: user.proProfile
        ? {
            status:
              user.proProfile.status.toLowerCase() as SharedProProfileStatus,
            rating: {
              ratingAvg:
                user.proProfile.ratingCount === 0
                  ? null
                  : Math.round(
                      (user.proProfile.ratingSum /
                        user.proProfile.ratingCount) *
                        10,
                    ) / 10,
              ratingCount: user.proProfile.ratingCount,
            },
          }
        : null,
      sessionCounts,
      paymentAttempts,
    };
  }

  async suspend(id: string, adminId: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException();
    }
    if (user.role === Role.ADMIN) {
      throw new ConflictException('Admin accounts cannot be suspended.');
    }
    if (user.suspendedAt) {
      throw new ConflictException('This account is already suspended.');
    }
    await this.prisma.$transaction(async (tx) => {
      // Guarded update: a concurrent suspension loses here and conflicts.
      const updated = await tx.user.updateMany({
        where: { id, suspendedAt: null },
        data: { suspendedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new ConflictException('This account is already suspended.');
      }
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    this.logger.log(`User ${id} suspended by admin ${adminId}`);
    return { ok: true };
  }

  async unsuspend(id: string, adminId: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException();
    }
    if (!user.suspendedAt) {
      throw new ConflictException('This account is not suspended.');
    }
    await this.prisma.user.update({
      where: { id },
      data: { suspendedAt: null },
    });
    this.logger.log(`User ${id} unsuspended by admin ${adminId}`);
    return { ok: true };
  }

  private toListItem(user: User): AdminUserListItem {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: toSharedRole(user.role),
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
    };
  }
}
