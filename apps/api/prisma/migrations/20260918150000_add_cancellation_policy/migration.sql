-- Cancellation policy (change 28): policy snapshot and cancellation record on
-- the session, the refunded part of a partial release, three email kinds.
CREATE TYPE "CancelledBy" AS ENUM ('PLAYER', 'COACH', 'ADMIN');
CREATE TYPE "CancellationTier" AS ENUM ('FREE', 'PARTIAL', 'NONE');

ALTER TYPE "NotificationKind" ADD VALUE 'CANCELLATION_FEE_WAIVED_PLAYER';
ALTER TYPE "NotificationKind" ADD VALUE 'CANCELLATION_FEE_WAIVED_COACH';
ALTER TYPE "NotificationKind" ADD VALUE 'COACH_LATE_CANCELLATIONS_ADMIN';

ALTER TABLE "Session"
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "cancelFreeHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "cancelLateRefundPercent" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "cancelNoRefundHours" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "cancelGraceMin" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledBy" "CancelledBy",
  ADD COLUMN "cancellationTier" "CancellationTier",
  ADD COLUMN "cancellationRefundMinor" INTEGER,
  ADD COLUMN "cancellationLate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "feeWaivedAt" TIMESTAMP(3),
  ADD COLUMN "feeWaivedById" TEXT;
CREATE INDEX "Session_proProfileId_cancelledBy_cancelledAt_idx" ON "Session"("proProfileId", "cancelledBy", "cancelledAt");

ALTER TABLE "Payment" ADD COLUMN "refundedMinor" INTEGER;

-- Sessions paid before this change: the hold's creation time is when they were paid.
UPDATE "Session" s
SET "paidAt" = p."createdAt"
FROM "Payment" p
WHERE p."sessionId" = s."id"
  AND p."status" IN ('HELD', 'RELEASED', 'REFUNDED');
