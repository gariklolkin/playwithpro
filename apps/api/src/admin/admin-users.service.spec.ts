import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;

  const tx = {
    user: { updateMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
  };
  const prisma = {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    session: { groupBy: jest.fn() },
    payment: { count: jest.fn() },
    $transaction: jest.fn((arg: unknown): Promise<unknown> =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (t: typeof tx) => Promise<unknown>)(tx),
    ),
  };

  const dbUser = {
    id: 'u1',
    email: 'player@example.com',
    displayName: 'Player One',
    role: 'AMATEUR',
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    suspendedAt: null as Date | null,
    locale: 'en',
    timezone: 'UTC',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AdminUsersService);
  });

  it('list searches email and name case-insensitively with a role filter, paginated', async () => {
    prisma.user.count.mockResolvedValue(41);
    prisma.user.findMany.mockResolvedValue([dbUser]);

    const result = await service.list({
      query: 'player',
      role: Role.Amateur,
      page: 3,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: 'AMATEUR',
          OR: [
            { email: { contains: 'player', mode: 'insensitive' } },
            { displayName: { contains: 'player', mode: 'insensitive' } },
          ],
        },
        skip: 40,
        take: 20,
      }),
    );
    expect(result.total).toBe(41);
    expect(result.page).toBe(3);
    expect(result.items[0]).toMatchObject({
      id: 'u1',
      role: Role.Amateur,
      suspendedAt: null,
      emailVerified: true,
    });
  });

  it('detail returns profile summaries and per-status session counters', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...dbUser,
      playerProfile: null,
      proProfile: { status: 'VERIFIED', ratingSum: 9, ratingCount: 2 },
    });
    prisma.session.groupBy.mockResolvedValue([
      { status: 'COMPLETED_PAID', _count: { _all: 3 } },
      { status: 'PENDING_PAYMENT', _count: { _all: 1 } },
    ]);
    prisma.payment.count.mockResolvedValue(5);

    const detail = await service.detail('u1');

    expect(prisma.session.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ playerId: 'u1' }, { proProfile: { userId: 'u1' } }] },
      }),
    );
    expect(detail.sessionCounts).toEqual({
      completed_paid: 3,
      pending_payment: 1,
    });
    expect(detail.paymentAttempts).toBe(5);
    expect(detail.proProfile).toEqual({
      status: 'verified',
      rating: { ratingAvg: 4.5, ratingCount: 2 },
    });
  });

  it('detail yields not-found for an unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.detail('ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('suspend stamps the user and revokes refresh tokens in one transaction', async () => {
    prisma.user.findUnique.mockResolvedValue(dbUser);
    tx.user.updateMany.mockResolvedValue({ count: 1 });

    await service.suspend('u1', 'admin-1');

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', suspendedAt: null },
      data: { suspendedAt: expect.any(Date) as Date },
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('suspend refuses admin accounts', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...dbUser, role: 'ADMIN' });

    await expect(service.suspend('u1', 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('suspend conflicts on an already-suspended account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...dbUser,
      suspendedAt: new Date(),
    });

    await expect(service.suspend('u1', 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('suspend conflicts when a concurrent suspension wins the race', async () => {
    prisma.user.findUnique.mockResolvedValue(dbUser);
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.suspend('u1', 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('suspend yields not-found for an unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.suspend('ghost', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('unsuspend clears the stamp', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...dbUser,
      suspendedAt: new Date(),
    });

    await service.unsuspend('u1', 'admin-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { suspendedAt: null },
    });
  });

  it('unsuspend conflicts on an account that is not suspended', async () => {
    prisma.user.findUnique.mockResolvedValue(dbUser);

    await expect(service.unsuspend('u1', 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
