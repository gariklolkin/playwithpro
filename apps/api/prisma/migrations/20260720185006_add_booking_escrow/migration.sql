-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID_ESCROW', 'IN_PROGRESS', 'AWAITING_CONFIRMATION', 'COMPLETED_PAID', 'DISPUTED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_HOLD', 'HELD', 'FAILED', 'RELEASED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "proProfileId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "platformFeeMinor" INTEGER NOT NULL,
    "slotId" TEXT NOT NULL,
    "videoId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_HOLD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_slotId_key" ON "Session"("slotId");

-- CreateIndex
CREATE INDEX "Session_playerId_startsAt_idx" ON "Session"("playerId", "startsAt");

-- CreateIndex
CREATE INDEX "Session_proProfileId_startsAt_idx" ON "Session"("proProfileId", "startsAt");

-- CreateIndex
CREATE INDEX "Session_status_expiresAt_idx" ON "Session"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Payment_sessionId_idx" ON "Payment"("sessionId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_proProfileId_fkey" FOREIGN KEY ("proProfileId") REFERENCES "ProProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AvailabilitySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
