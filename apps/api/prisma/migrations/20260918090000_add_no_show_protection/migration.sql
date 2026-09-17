-- No-show protection (change 27): attendance classification on the session,
-- system-opened disputes with a coach response window, the coach's game answer.
CREATE TYPE "DisputeKind" AS ENUM ('PLAYER_REPORTED', 'COACH_NO_SHOW', 'NO_ATTENDANCE', 'EVIDENCE_GAP');
CREATE TYPE "DisputeReasonCategory" AS ENUM ('COACH_NO_SHOW', 'COACH_LATE_OR_LEFT_EARLY', 'TECHNICAL_PROBLEM', 'OTHER');
CREATE TYPE "DisputeResolvedVia" AS ENUM ('ADMIN', 'SYSTEM', 'PLAYER_CONFIRMATION');
CREATE TYPE "AttendanceOutcome" AS ENUM ('HELD', 'PLAYER_NO_SHOW', 'COACH_NO_SHOW', 'NO_ATTENDANCE', 'EVIDENCE_GAP');
CREATE TYPE "CoachGameAnswer" AS ENUM ('TOOK_PLACE', 'PLAYER_ABSENT');

ALTER TABLE "Session"
  ADD COLUMN "coachGameAnswer" "CoachGameAnswer",
  ADD COLUMN "attendanceOutcome" "AttendanceOutcome",
  ADD COLUMN "attendancePartial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "classifiedAt" TIMESTAMP(3);
CREATE INDEX "Session_status_classifiedAt_endsAt_idx" ON "Session"("status", "classifiedAt", "endsAt");

ALTER TABLE "Dispute"
  ADD COLUMN "kind" "DisputeKind" NOT NULL DEFAULT 'PLAYER_REPORTED',
  ADD COLUMN "reasonCategory" "DisputeReasonCategory",
  ADD COLUMN "resolvedVia" "DisputeResolvedVia",
  ADD COLUMN "systemNoteCode" TEXT,
  ADD COLUMN "coachResponse" TEXT,
  ADD COLUMN "coachRespondedAt" TIMESTAMP(3),
  ADD COLUMN "responseDueAt" TIMESTAMP(3),
  ALTER COLUMN "openedById" DROP NOT NULL,
  ALTER COLUMN "reason" DROP NOT NULL;
CREATE INDEX "Dispute_status_responseDueAt_idx" ON "Dispute"("status", "responseDueAt");

-- Every existing dispute was opened by a player with free text and, when
-- resolved, by an admin.
UPDATE "Dispute" SET "reasonCategory" = 'OTHER';
UPDATE "Dispute" SET "resolvedVia" = 'ADMIN' WHERE "status" = 'RESOLVED';
