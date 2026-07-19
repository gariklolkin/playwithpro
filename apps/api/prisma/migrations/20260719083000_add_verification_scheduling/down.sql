-- Manual rollback for add_verification_scheduling (Prisma does not run this automatically).
-- Restores the pre-scheduling shape; messenger contacts are unrecoverable and come back empty.

DROP TABLE IF EXISTS "VerificationBooking";
DROP TABLE IF EXISTS "VerificationSlot";
DROP TYPE IF EXISTS "BookingStatus";
DROP TYPE IF EXISTS "SlotStatus";
DROP TYPE IF EXISTS "MeetingSyncStatus";

CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "VerificationRequest"
ADD COLUMN "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "contactTelegram" TEXT NOT NULL DEFAULT '',
ADD COLUMN "contactPhone" TEXT NOT NULL DEFAULT '',
ADD COLUMN "callRequestedAt" TIMESTAMP(3);

UPDATE "VerificationRequest" SET "status" = CASE
  WHEN "state" IN ('AWAITING_SCHEDULING', 'SCHEDULED', 'IN_PROGRESS') THEN 'PENDING'::"VerificationStatus"
  WHEN "state" = 'VERIFIED' THEN 'APPROVED'::"VerificationStatus"
  ELSE 'REJECTED'::"VerificationStatus"
END;

DROP INDEX IF EXISTS "VerificationRequest_state_createdAt_idx";
ALTER TABLE "VerificationRequest" DROP COLUMN "state", DROP COLUMN "noShowCount";
DROP TYPE "VerificationState";
CREATE INDEX "VerificationRequest_status_createdAt_idx" ON "VerificationRequest"("status", "createdAt");
