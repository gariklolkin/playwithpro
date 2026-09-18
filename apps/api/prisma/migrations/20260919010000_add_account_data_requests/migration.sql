-- Account deletion and export (change 31): the request audit trail, the
-- tombstone/schedule stamps on the user, five account email kinds.
CREATE TYPE "AccountDataRequestKind" AS ENUM ('DELETION', 'EXPORT');
CREATE TYPE "AccountDataRequestStatus" AS ENUM ('SCHEDULED', 'RUNNING', 'POSTPONED', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "AccountDataRequestInitiator" AS ENUM ('SELF', 'ADMIN');

ALTER TYPE "NotificationKind" ADD VALUE 'ACCOUNT_DELETION_REQUESTED';
ALTER TYPE "NotificationKind" ADD VALUE 'ACCOUNT_DELETION_CANCELLED';
ALTER TYPE "NotificationKind" ADD VALUE 'ACCOUNT_DELETION_POSTPONED';
ALTER TYPE "NotificationKind" ADD VALUE 'ACCOUNT_DELETION_BY_ADMIN';
ALTER TYPE "NotificationKind" ADD VALUE 'ACCOUNT_EXPORT_READY';

ALTER TABLE "User"
  ADD COLUMN "deletionScheduledFor" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "AccountDataRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "AccountDataRequestKind" NOT NULL,
  "status" "AccountDataRequestStatus" NOT NULL DEFAULT 'SCHEDULED',
  "initiatedBy" "AccountDataRequestInitiator" NOT NULL DEFAULT 'SELF',
  "adminId" TEXT,
  "reason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "postponedAt" TIMESTAMP(3),
  "steps" JSONB,
  "lastError" TEXT,
  "exportKey" TEXT,
  "exportExpiresAt" TIMESTAMP(3),
  CONSTRAINT "AccountDataRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountDataRequest_userId_kind_requestedAt_idx" ON "AccountDataRequest"("userId", "kind", "requestedAt");
CREATE INDEX "AccountDataRequest_kind_status_scheduledFor_idx" ON "AccountDataRequest"("kind", "status", "scheduledFor");
ALTER TABLE "AccountDataRequest" ADD CONSTRAINT "AccountDataRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
