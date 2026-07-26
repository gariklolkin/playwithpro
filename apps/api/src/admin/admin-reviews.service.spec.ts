import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminReviewsService } from './admin-reviews.service';

describe('AdminReviewsService', () => {
  let service: AdminReviewsService;

  const tx = {
    review: { delete: jest.fn() },
    proProfile: { update: jest.fn() },
  };
  const prisma = {
    review: { count: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((arg: unknown): Promise<unknown> =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (t: typeof tx) => Promise<unknown>)(tx),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminReviewsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AdminReviewsService);
  });

  it('list searches coach and player names and maps rows newest first', async () => {
    prisma.review.count.mockResolvedValue(1);
    prisma.review.findMany.mockResolvedValue([
      {
        id: 'r1',
        sessionId: 's1',
        proProfileId: 'pro-1',
        rating: 2,
        text: 'meh',
        createdAt: new Date('2026-07-20T10:00:00Z'),
        player: { displayName: 'Player' },
        proProfile: { user: { displayName: 'Coach' } },
      },
    ]);

    const result = await service.list({ query: 'coa', page: 1 });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              proProfile: {
                user: { displayName: { contains: 'coa', mode: 'insensitive' } },
              },
            },
            {
              player: { displayName: { contains: 'coa', mode: 'insensitive' } },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result.items[0]).toMatchObject({
      id: 'r1',
      rating: 2,
      coachDisplayName: 'Coach',
      playerDisplayName: 'Player',
    });
  });

  it('remove deletes the review and decrements the aggregate in the same transaction', async () => {
    tx.review.delete.mockResolvedValue({
      rating: 5,
      proProfileId: 'pro-1',
      sessionId: 's1',
    });

    await service.remove('r1', 'spam', 'admin-1');

    expect(tx.review.delete).toHaveBeenCalledWith({
      where: { id: 'r1' },
      select: { rating: true, proProfileId: true, sessionId: true },
    });
    expect(tx.proProfile.update).toHaveBeenCalledWith({
      where: { id: 'pro-1' },
      data: { ratingSum: { decrement: 5 }, ratingCount: { decrement: 1 } },
    });
  });

  it('remove of a missing review yields not-found without touching the aggregate', async () => {
    tx.review.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.remove('ghost', 'spam', 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.proProfile.update).not.toHaveBeenCalled();
  });
});
