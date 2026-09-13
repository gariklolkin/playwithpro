-- Several clips per video-analysis session: Session.videoId becomes the
-- SessionVideo join table (backfilled, then dropped), and Video gets the
-- retention clock for clips not attached to any live session.

-- CreateTable
CREATE TABLE "SessionVideo" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "note" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionVideo_sessionId_videoId_key" ON "SessionVideo"("sessionId", "videoId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionVideo_sessionId_position_key" ON "SessionVideo"("sessionId", "position");

-- CreateIndex
CREATE INDEX "SessionVideo_videoId_idx" ON "SessionVideo"("videoId");

-- AddForeignKey
ALTER TABLE "SessionVideo" ADD CONSTRAINT "SessionVideo_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionVideo" ADD CONSTRAINT "SessionVideo_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the single attached video becomes clip 0.
INSERT INTO "SessionVideo" ("id", "sessionId", "videoId", "position", "addedAt")
SELECT gen_random_uuid()::text, "id", "videoId", 0, "createdAt"
FROM "Session"
WHERE "videoId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_videoId_fkey";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "videoId";

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "unattachedSince" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Video_status_unattachedSince_idx" ON "Video"("status", "unattachedSince");

-- Start the retention clock at deploy time for ready videos without a live
-- (non-cancelled) attachment; nothing is deleted retroactively.
UPDATE "Video" v
SET "unattachedSince" = CURRENT_TIMESTAMP
WHERE v."status" = 'READY'
  AND NOT EXISTS (
    SELECT 1
    FROM "SessionVideo" sv
    JOIN "Session" s ON s."id" = sv."sessionId"
    WHERE sv."videoId" = v."id"
      AND s."status" <> 'CANCELLED'
  );
