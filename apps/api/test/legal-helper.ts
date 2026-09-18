import { LegalDocument, currentLegalVersion } from '@playwithpro/shared';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Suite users are created straight through Prisma, so nobody accepted
 * anything: bind every user (or the given ones) to the current terms — and
 * every professional to the coach agreement — the way sign-up and the
 * verification card would have. Idempotent.
 */
export async function acceptCurrentLegal(
  prisma: PrismaService,
  userIds?: string[],
): Promise<void> {
  const users = await prisma.user.findMany({
    where: userIds ? { id: { in: userIds } } : {},
    select: {
      id: true,
      role: true,
      legalAcceptances: { select: { document: true } },
    },
  });
  const rows: Array<{
    userId: string;
    document: string;
    version: string;
    locale: string;
    context: 'REGISTRATION' | 'VERIFICATION_SUBMIT';
  }> = [];
  for (const user of users) {
    const has = new Set(user.legalAcceptances.map((row) => row.document));
    if (!has.has(LegalDocument.Terms)) {
      rows.push({
        userId: user.id,
        document: LegalDocument.Terms,
        version: currentLegalVersion(LegalDocument.Terms).version,
        locale: 'en',
        context: 'REGISTRATION',
      });
    }
    if (
      user.role === 'PROFESSIONAL' &&
      !has.has(LegalDocument.CoachAgreement)
    ) {
      rows.push({
        userId: user.id,
        document: LegalDocument.CoachAgreement,
        version: currentLegalVersion(LegalDocument.CoachAgreement).version,
        locale: 'en',
        context: 'VERIFICATION_SUBMIT',
      });
    }
  }
  if (rows.length > 0) {
    await prisma.legalAcceptance.createMany({ data: rows });
  }
}
