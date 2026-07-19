-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('AWAITING_SCHEDULING', 'SCHEDULED', 'IN_PROGRESS', 'VERIFIED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'BOOKED', 'REMOVED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'RESCHEDULED', 'NO_SHOW', 'CANCELLED_BY_PRO', 'CANCELLED_BY_ADMIN');

-- CreateEnum
CREATE TYPE "MeetingSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- AlterTable: add the new state machine columns first
ALTER TABLE "VerificationRequest"
ADD COLUMN "noShowCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "state" "VerificationState" NOT NULL DEFAULT 'AWAITING_SCHEDULING';

-- DataMigration: map the old review status onto the new state machine
UPDATE "VerificationRequest" SET "state" = CASE "status"
  WHEN 'PENDING'::"VerificationStatus" THEN 'AWAITING_SCHEDULING'::"VerificationState"
  WHEN 'APPROVED'::"VerificationStatus" THEN 'VERIFIED'::"VerificationState"
  WHEN 'REJECTED'::"VerificationStatus" THEN 'REJECTED'::"VerificationState"
END;

-- DropIndex
DROP INDEX "VerificationRequest_status_createdAt_idx";

-- AlterTable: retire the manual-call flow (contacts + call invitation)
ALTER TABLE "VerificationRequest"
DROP COLUMN "callRequestedAt",
DROP COLUMN "contactPhone",
DROP COLUMN "contactTelegram",
DROP COLUMN "status";

-- DropEnum
DROP TYPE "VerificationStatus";

-- CreateTable
CREATE TABLE "VerificationSlot" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationBooking" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "googleEventId" TEXT,
    "meetUrl" TEXT,
    "syncStatus" "MeetingSyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncAttempts" INTEGER NOT NULL DEFAULT 0,
    "reminder24hSentAt" TIMESTAMP(3),
    "reminder1hSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationSlot_status_startsAt_idx" ON "VerificationSlot"("status", "startsAt");

-- CreateIndex
CREATE INDEX "VerificationBooking_slotId_idx" ON "VerificationBooking"("slotId");

-- CreateIndex: at most one ACTIVE booking per slot; finished attempts stay as audit rows
CREATE UNIQUE INDEX "VerificationBooking_active_slot_key" ON "VerificationBooking"("slotId") WHERE "status" = 'SCHEDULED';

-- CreateIndex
CREATE INDEX "VerificationBooking_requestId_idx" ON "VerificationBooking"("requestId");

-- CreateIndex
CREATE INDEX "VerificationBooking_status_syncStatus_idx" ON "VerificationBooking"("status", "syncStatus");

-- CreateIndex
CREATE INDEX "VerificationRequest_state_createdAt_idx" ON "VerificationRequest"("state", "createdAt");

-- AddForeignKey
ALTER TABLE "VerificationBooking" ADD CONSTRAINT "VerificationBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "VerificationSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationBooking" ADD CONSTRAINT "VerificationBooking_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
