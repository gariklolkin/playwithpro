-- Session lifecycle notifications (change 26): outbox table, email
-- preferences, calendar sequence and the clip-change stamp.
CREATE TYPE "NotificationKind" AS ENUM ('SESSION_PAID_PLAYER', 'SESSION_PAID_COACH', 'SESSION_CLIPS_CHANGED', 'SESSION_REMINDER_24H', 'SESSION_REMINDER_1H', 'SESSION_ENDED_PLAYER', 'SESSION_ENDED_COACH', 'SESSION_COMPLETED_PLAYER', 'SESSION_COMPLETED_COACH', 'DISPUTE_OPENED_PLAYER', 'DISPUTE_OPENED_COACH', 'DISPUTE_OPENED_ADMIN', 'DISPUTE_RESOLVED_PLAYER', 'DISPUTE_RESOLVED_COACH', 'SESSION_CANCELLED_PLAYER', 'SESSION_CANCELLED_COACH', 'SESSION_CANCELLED_ADMIN', 'REVIEW_RECEIVED');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

ALTER TABLE "User"
  ADD COLUMN "emailReminders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailClipChanges" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailReviews" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Session"
  ADD COLUMN "calendarSequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "videosChangedAt" TIMESTAMP(3);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "sessionId" TEXT,
  "recipientId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_status_dueAt_idx" ON "Notification"("status", "dueAt");
CREATE INDEX "Notification_sessionId_kind_idx" ON "Notification"("sessionId", "kind");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
