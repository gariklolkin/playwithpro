-- A cancelled or expired session kept its slot uniquely claimed forever, so a
-- reopened slot could never be booked again (unique violation → 500).
-- DropIndex
DROP INDEX "Session_slotId_key";

-- CreateIndex
CREATE INDEX "Session_slotId_idx" ON "Session"("slotId");
