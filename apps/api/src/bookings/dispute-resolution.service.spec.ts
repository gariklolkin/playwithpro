import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DisputeResolutionService } from './dispute-resolution.service';
import type { SettlementService } from './settlement.service';

describe('DisputeResolutionService', () => {
  const tx = {
    dispute: { updateMany: jest.fn() },
    session: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const settlement = { settle: jest.fn() };
  const service = new DisputeResolutionService(
    prisma as unknown as PrismaService,
    settlement as unknown as SettlementService,
  );
  const dispute = { id: 'dispute-1', sessionId: 'session-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.dispute.updateMany.mockResolvedValue({ count: 1 });
  });

  it('system refund: no resolver, a note code, and it never beats a coach response', async () => {
    await service.resolve(dispute, 'REFUND', {
      type: 'system',
      noteCode: 'NO_COACH_RESPONSE',
    });

    expect(tx.dispute.updateMany).toHaveBeenCalledWith({
      where: { id: 'dispute-1', status: 'OPEN', coachRespondedAt: null },
      data: expect.objectContaining({
        status: 'RESOLVED',
        outcome: 'REFUND',
        resolvedById: null,
        resolvedVia: 'SYSTEM',
        systemNoteCode: 'NO_COACH_RESPONSE',
        responseDueAt: null,
      }) as object,
    });
    expect(settlement.settle).toHaveBeenCalledWith('session-1');
  });

  it("player confirmation: releases and stamps the player's confirmation", async () => {
    await service.resolve(dispute, 'RELEASE', {
      type: 'player',
      userId: 'player-1',
    });

    expect(tx.dispute.updateMany).toHaveBeenCalledWith({
      where: { id: 'dispute-1', status: 'OPEN' },
      data: expect.objectContaining({
        outcome: 'RELEASE',
        resolvedById: 'player-1',
        resolvedVia: 'PLAYER_CONFIRMATION',
      }) as object,
    });
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', status: 'DISPUTED' },
      data: { status: 'RESOLVED', playerConfirmedAt: expect.any(Date) as Date },
    });
  });

  it('whoever loses the race gets a conflict and moves no money', async () => {
    tx.dispute.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.resolve(dispute, 'REFUND', { type: 'admin', userId: 'admin-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.session.updateMany).not.toHaveBeenCalled();
    expect(settlement.settle).not.toHaveBeenCalled();
  });
});
