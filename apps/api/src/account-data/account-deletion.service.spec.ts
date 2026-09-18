/* eslint-disable @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access
   -- jest mock call records are untyped; assertions narrow where it matters. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AccountDeletionService } from './account-deletion.service';
import type { AccountErasureHook } from './erasure-hook';

describe('AccountDeletionService', () => {
  const tx = {
    user: { updateMany: jest.fn(), update: jest.fn() },
    accountDataRequest: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    refreshToken: { updateMany: jest.fn() },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    session: { findMany: jest.fn() },
    payment: { findMany: jest.fn() },
    proProfile: { findUnique: jest.fn() },
    verificationRequest: { count: jest.fn() },
    availabilityRule: { deleteMany: jest.fn() },
    availabilitySlot: { updateMany: jest.fn() },
    notification: { updateMany: jest.fn() },
    accountDataRequest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((arg: unknown): Promise<unknown> =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (t: typeof tx) => Promise<unknown>)(tx),
    ),
  };
  const values: Record<string, number> = {
    ACCOUNT_DELETION_GRACE_DAYS: 14,
    ACCOUNT_DELETION_POSTPONE_DAYS: 7,
  };
  const config = { getOrThrow: (key: string) => values[key] };
  const tokens = { createEmailCode: jest.fn(), consumeEmailCode: jest.fn() };
  const bookings = { cancelUnpaidOf: jest.fn() };
  const notifications = { enqueue: jest.fn() };
  const mailer = { send: jest.fn(), deliver: jest.fn() };
  const renderer = {
    render: jest.fn(() => ({ subject: 's', text: 't', html: 'h' })),
  };
  const scheduling = { withdraw: jest.fn() };
  const hookA = { name: 'a', erase: jest.fn() };
  const hookB = { name: 'b', erase: jest.fn() };

  let service: AccountDeletionService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUniqueOrThrow.mockReset();
    prisma.session.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.proProfile.findUnique.mockResolvedValue(null);
    prisma.accountDataRequest.findFirst.mockResolvedValue(null);
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    tx.accountDataRequest.create.mockResolvedValue({ id: 'req-1' });
    hookA.erase.mockResolvedValue({ status: 'done' });
    hookB.erase.mockResolvedValue({ status: 'done' });
    service = new AccountDeletionService(
      prisma as never,
      config as never,
      tokens as never,
      bookings as never,
      notifications as never,
      mailer as never,
      renderer as never,
      scheduling as never,
      [hookA, hookB] as AccountErasureHook[],
    );
  });

  const passwordUser = async () => ({
    role: 'AMATEUR',
    passwordHash: await argon2.hash('secret-pass'),
    deletionScheduledFor: null,
  });

  describe('request', () => {
    it('lists the open sessions as blockers and changes nothing', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce(await passwordUser());
      prisma.session.findMany.mockResolvedValue([
        {
          id: 's1',
          status: 'AWAITING_CONFIRMATION',
          serviceType: 'CONSULTATION',
          startsAt: new Date('2026-09-20T10:00:00Z'),
          playerId: 'u1',
        },
      ]);
      const error = await service
        .request('u1', { password: 'secret-pass' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'account_deletion_blocked',
        blockers: [
          {
            kind: 'session',
            sessionId: 's1',
            status: 'awaiting_confirmation',
            role: 'player',
          },
        ],
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a wrong password', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce(await passwordUser());
      await expect(
        service.request('u1', { password: 'nope' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('asks a Google-only account for the emailed code', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
        role: 'AMATEUR',
        passwordHash: null,
        deletionScheduledFor: null,
      });
      await expect(service.request('u1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tokens.consumeEmailCode).not.toHaveBeenCalled();
    });

    it('refuses admins', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
        role: 'ADMIN',
        passwordHash: null,
        deletionScheduledFor: null,
      });
      await expect(service.request('u1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('schedules, signs everyone out, emails and withdraws the coach', async () => {
      prisma.user.findUniqueOrThrow
        .mockResolvedValueOnce(await passwordUser())
        .mockResolvedValueOnce({
          deletionScheduledFor: new Date(),
          passwordHash: 'x',
        });
      prisma.proProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
      prisma.verificationRequest.count.mockResolvedValue(1);
      await service.request('u1', { password: 'secret-pass' });

      const scheduled = tx.user.updateMany.mock.calls[0][0].data
        .deletionScheduledFor as Date;
      expect(scheduled.getTime() - Date.now()).toBeGreaterThan(
        13.9 * 24 * 3_600_000,
      );
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
      );
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({
          kind: 'ACCOUNT_DELETION_REQUESTED',
          sessionId: null,
          recipientId: 'u1',
        }),
      ]);
      expect(bookings.cancelUnpaidOf).toHaveBeenCalledWith('u1');
      expect(scheduling.withdraw).toHaveBeenCalledWith('u1');
    });
  });

  describe('requestByAdmin', () => {
    it('protects the last admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'ADMIN',
        deletedAt: null,
        deletionScheduledFor: null,
      });
      prisma.user.count.mockResolvedValue(0);
      await expect(
        service.requestByAdmin('a1', 'a2', 'why'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.requestByAdmin('a1', 'a1', 'why'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('records the admin, the reason and an immediate grace', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'AMATEUR',
        deletedAt: null,
        deletionScheduledFor: null,
      });
      await service.requestByAdmin('a1', 'u1', 'request by email', 0);
      expect(tx.accountDataRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          initiatedBy: 'ADMIN',
          adminId: 'a1',
          reason: 'request by email',
        }),
      });
      const scheduled = tx.user.updateMany.mock.calls[0][0].data
        .deletionScheduledFor as Date;
      expect(Math.abs(scheduled.getTime() - Date.now())).toBeLessThan(5_000);
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({ kind: 'ACCOUNT_DELETION_BY_ADMIN' }),
      ]);
    });
  });

  it('cancel clears the schedule and marks the request cancelled', async () => {
    tx.accountDataRequest.findFirst.mockResolvedValue({ id: 'req-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      deletionScheduledFor: null,
      passwordHash: 'x',
    });
    const status = await service.cancel('u1');
    expect(tx.accountDataRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    });
    expect(status.scheduledFor).toBeNull();
  });

  describe('execute', () => {
    const request = {
      id: 'req-1',
      userId: 'u1',
      status: 'SCHEDULED',
      steps: null,
    } as never;

    beforeEach(() => {
      prisma.accountDataRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        email: 'u1@example.com',
        locale: 'de',
        displayName: 'Uwe',
        deletedAt: null,
      });
    });

    it('postpones and emails when a blocker appeared', async () => {
      prisma.payment.findMany.mockResolvedValue([
        { sessionId: 's9', amountMinor: 5000, currency: 'EUR' },
      ]);
      await service.execute(request);
      expect(tx.accountDataRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: expect.objectContaining({ status: 'POSTPONED' }),
      });
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({ kind: 'ACCOUNT_DELETION_POSTPONED' }),
      ]);
      expect(hookA.erase).not.toHaveBeenCalled();
    });

    it('records a failed step and leaves the tombstone for the retry', async () => {
      hookB.erase.mockRejectedValue(new Error('storage down'));
      await service.execute(request);
      const last = prisma.accountDataRequest.update.mock.calls.at(-1)[0];
      expect(last.data.status).toBe('FAILED');
      const steps =
        prisma.accountDataRequest.update.mock.calls.at(-2)[0].data.steps;
      expect(steps.a.status).toBe('done');
      expect(steps.b).toMatchObject({
        status: 'failed',
        error: 'storage down',
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('resumes: done steps are skipped, then the email and the tombstone', async () => {
      await service.execute({
        ...(request as object),
        status: 'FAILED',
        steps: {
          a: { status: 'done', at: 'x' },
          b: { status: 'failed', at: 'x' },
        },
      } as never);
      expect(hookA.erase).not.toHaveBeenCalled();
      expect(hookB.erase).toHaveBeenCalledWith('u1');
      expect(mailer.send).toHaveBeenCalledWith(
        'u1@example.com',
        expect.anything(),
      );
      expect(renderer.render).toHaveBeenCalledWith(
        'de',
        'account.deletionCompleted',
        {
          name: 'Uwe',
        },
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({
          email: 'deleted-u1@invalid',
          displayName: '',
          passwordHash: null,
          deletedAt: expect.any(Date),
        }),
      });
      const last = prisma.accountDataRequest.update.mock.calls.at(-1)[0];
      expect(last.data.status).toBe('COMPLETED');
      expect(mailer.send.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.user.update.mock.invocationCallOrder[0],
      );
    });

    it('does nothing when another runner claimed the request', async () => {
      prisma.accountDataRequest.updateMany.mockResolvedValue({ count: 0 });
      await service.execute(request);
      expect(hookA.erase).not.toHaveBeenCalled();
    });
  });

  it('reapply runs every hook and the tombstone again without emailing', async () => {
    prisma.accountDataRequest.findMany.mockResolvedValue([{ userId: 'u1' }]);
    prisma.user.findUnique.mockResolvedValue({ id: 'x' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'restored@example.com',
      locale: 'en',
      displayName: 'Restored',
      deletedAt: null,
    });
    const applied = await service.reapply(['u2']);
    expect(applied).toEqual(['u2', 'u1']);
    expect(hookA.erase).toHaveBeenCalledTimes(2);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u2' },
        data: expect.objectContaining({ email: 'deleted-u2@invalid' }),
      }),
    );
    // Only the deletion the restored database did not know is recorded anew.
    expect(prisma.accountDataRequest.create).toHaveBeenCalledTimes(1);
    expect(prisma.accountDataRequest.create.mock.calls[0][0].data.userId).toBe(
      'u2',
    );
  });
});
