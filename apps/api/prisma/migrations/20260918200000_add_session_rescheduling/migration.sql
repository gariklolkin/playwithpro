-- Session rescheduling (change 29): proposals with held slot options, the
-- reschedule counters on the session, six email kinds.
CREATE TYPE "RescheduleStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED');

ALTER TYPE "NotificationKind" ADD VALUE 'RESCHEDULE_PROPOSED';
ALTER TYPE "NotificationKind" ADD VALUE 'RESCHEDULE_ACCEPTED_PLAYER';
ALTER TYPE "NotificationKind" ADD VALUE 'RESCHEDULE_ACCEPTED_COACH';
ALTER TYPE "NotificationKind" ADD VALUE 'RESCHEDULE_DECLINED';
ALTER TYPE "NotificationKind" ADD VALUE 'RESCHEDULE_WITHDRAWN';
ALTER TYPE "NotificationKind" ADD VALUE 'RESCHEDULE_EXPIRED';

ALTER TABLE "Session"
  ADD COLUMN "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rescheduledAt" TIMESTAMP(3),
  ADD COLUMN "cancelTierFloor" "CancellationTier";

CREATE TABLE "SessionReschedule" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "proposedById" TEXT NOT NULL,
  "byCoach" BOOLEAN NOT NULL,
  "status" "RescheduleStatus" NOT NULL DEFAULT 'OPEN',
  "fromStartsAt" TIMESTAMP(3) NOT NULL,
  "fromEndsAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedOptionId" TEXT,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionReschedule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessionReschedule_acceptedOptionId_key" ON "SessionReschedule"("acceptedOptionId");
CREATE INDEX "SessionReschedule_sessionId_createdAt_idx" ON "SessionReschedule"("sessionId", "createdAt");
CREATE INDEX "SessionReschedule_status_expiresAt_idx" ON "SessionReschedule"("status", "expiresAt");
-- At most one open proposal per session. A partial index: Prisma's schema
-- cannot express it, so it lives only here (and `migrate diff` ignores it).
CREATE UNIQUE INDEX "SessionReschedule_one_open_per_session" ON "SessionReschedule"("sessionId") WHERE "status" = 'OPEN';

CREATE TABLE "SessionRescheduleOption" (
  "id" TEXT NOT NULL,
  "rescheduleId" TEXT NOT NULL,
  "slotId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionRescheduleOption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SessionRescheduleOption_rescheduleId_idx" ON "SessionRescheduleOption"("rescheduleId");
CREATE INDEX "SessionRescheduleOption_slotId_idx" ON "SessionRescheduleOption"("slotId");

ALTER TABLE "SessionReschedule" ADD CONSTRAINT "SessionReschedule_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionReschedule" ADD CONSTRAINT "SessionReschedule_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionRescheduleOption" ADD CONSTRAINT "SessionRescheduleOption_rescheduleId_fkey" FOREIGN KEY ("rescheduleId") REFERENCES "SessionReschedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionRescheduleOption" ADD CONSTRAINT "SessionRescheduleOption_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AvailabilitySlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
