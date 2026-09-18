import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { LegalDocument } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LegalService } from './legal.service';

describe('LegalService', () => {
  const prisma = {
    user: { findUniqueOrThrow: jest.fn() },
    legalAcceptance: { findMany: jest.fn(), createMany: jest.fn() },
  };
  const config = { getOrThrow: jest.fn((name: string) => `<${name}>`) };
  const service = new LegalService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );
  const CURRENT = '2026-09-18';

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      role: 'AMATEUR',
      proProfile: null,
    });
    prisma.legalAcceptance.findMany.mockResolvedValue([]);
  });

  describe('assertCurrent', () => {
    it('accepts the current versions', () => {
      expect(() =>
        service.assertCurrent([
          { document: LegalDocument.Terms, version: CURRENT },
          { document: LegalDocument.Privacy, version: CURRENT },
        ]),
      ).not.toThrow();
    });

    it('refuses an outdated version with the stable code and the current one', () => {
      let caught: unknown;
      try {
        service.assertCurrent([
          { document: LegalDocument.Terms, version: '2020-01-01' },
        ]);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'legal_version_outdated',
        documents: [{ document: 'terms', version: CURRENT }],
      });
    });
  });

  describe('status', () => {
    it('is stale for a user who never accepted the terms', async () => {
      const status = await service.status('u1');
      expect(status.stale).toEqual([
        {
          document: 'terms',
          version: CURRENT,
          effectiveAt: CURRENT,
          acceptedVersion: null,
        },
      ]);
      expect(status.notices).toEqual([]);
    });

    it('is clean once the current terms are accepted', async () => {
      prisma.legalAcceptance.findMany.mockResolvedValue([
        { document: 'terms', version: CURRENT },
      ]);
      const status = await service.status('u1');
      expect(status).toEqual({ stale: [], notices: [] });
    });

    it('asks a verified coach for the coach agreement too', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        role: 'PROFESSIONAL',
        proProfile: { status: 'VERIFIED' },
      });
      prisma.legalAcceptance.findMany.mockResolvedValue([
        { document: 'terms', version: CURRENT },
      ]);
      const status = await service.status('c1');
      expect(status.stale.map((item) => item.document)).toEqual([
        'coach-agreement',
      ]);
    });

    it('leaves a draft coach alone until they submit', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        role: 'PROFESSIONAL',
        proProfile: { status: 'DRAFT' },
      });
      prisma.legalAcceptance.findMany.mockResolvedValue([
        { document: 'terms', version: CURRENT },
      ]);
      expect((await service.status('c1')).stale).toEqual([]);
    });

    it('takes the newest row per document, whatever its position', async () => {
      prisma.legalAcceptance.findMany.mockResolvedValue([
        { document: 'terms', version: '2020-01-01' },
        { document: 'terms', version: CURRENT },
      ]);
      expect((await service.status('u1')).stale).toEqual([]);
    });
  });

  describe('assertAccepted', () => {
    it('throws the stable conflict naming the documents', async () => {
      let caught: unknown;
      try {
        await service.assertAccepted('u1');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).getResponse()).toMatchObject({
        code: 'legal_reacceptance_required',
        documents: [{ document: 'terms', version: CURRENT }],
      });
    });
  });

  describe('accept', () => {
    it('records the current versions with the re-acceptance context', async () => {
      prisma.legalAcceptance.findMany.mockResolvedValue([
        { document: 'terms', version: CURRENT },
      ]);
      const status = await service.accept(
        'u1',
        [{ document: LegalDocument.Terms, version: CURRENT }],
        'de',
      );
      expect(prisma.legalAcceptance.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'u1',
            document: 'terms',
            version: CURRENT,
            locale: 'de',
            context: 'REACCEPT',
            sessionId: null,
          },
        ],
      });
      expect(status.stale).toEqual([]);
    });

    it('refuses unknown and outdated versions', async () => {
      await expect(
        service.accept(
          'u1',
          [{ document: LegalDocument.Terms, version: '1999-01-01' }],
          'en',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.legalAcceptance.createMany).not.toHaveBeenCalled();
    });
  });

  it('reads every fact from configuration', () => {
    expect(service.facts()).toMatchObject({
      operatorName: '<OPERATOR_NAME>',
      feePercent: '<PLATFORM_FEE_PERCENT>',
      cancellationFreeHours: '<CANCELLATION_FREE_HOURS>',
      unattachedVideoRetentionDays: '<VIDEO_UNATTACHED_RETENTION_DAYS>',
    });
  });
});
