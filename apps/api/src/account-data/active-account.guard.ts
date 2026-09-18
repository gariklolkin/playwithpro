import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ACCOUNT_ERROR_DELETION_PENDING } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Commitment actions (booking, paying, availability, verification, uploads)
 * are refused while the account is scheduled for deletion; everything the
 * grace screen offers — cancel, export, reading — and settling what is
 * already paid stays possible.
 */
@Injectable()
export class ActiveAccountGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) return true;
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { deletionScheduledFor: true, deletedAt: true },
    });
    if (user?.deletionScheduledFor || user?.deletedAt) {
      throw new ConflictException({
        statusCode: 409,
        code: ACCOUNT_ERROR_DELETION_PENDING,
        message: 'This account is scheduled for deletion.',
        scheduledFor: user.deletionScheduledFor?.toISOString() ?? null,
      });
    }
    return true;
  }
}
