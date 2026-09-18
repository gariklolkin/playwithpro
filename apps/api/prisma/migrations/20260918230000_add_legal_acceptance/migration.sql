-- Legal terms acceptance (change 30): append-only acceptance evidence and
-- the update-notice email kind. Documents and versions live in code.
CREATE TYPE "LegalAcceptanceContext" AS ENUM ('REGISTRATION', 'OAUTH_COMPLETE', 'VERIFICATION_SUBMIT', 'CHECKOUT', 'REACCEPT');
ALTER TYPE "NotificationKind" ADD VALUE 'LEGAL_UPDATE_NOTICE';

CREATE TABLE "LegalAcceptance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "document" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "context" "LegalAcceptanceContext" NOT NULL,
  "sessionId" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LegalAcceptance_userId_document_acceptedAt_idx" ON "LegalAcceptance"("userId", "document", "acceptedAt");
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
