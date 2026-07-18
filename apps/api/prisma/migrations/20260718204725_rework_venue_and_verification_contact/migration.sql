-- AlterTable
ALTER TABLE "ProProfile" DROP COLUMN "city",
DROP COLUMN "country";

-- AlterTable
ALTER TABLE "ProService" DROP COLUMN "venueCity",
DROP COLUMN "venueClub",
ADD COLUMN     "venueLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "venueLat" DOUBLE PRECISION,
ADD COLUMN     "venueLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "VerificationRequest" DROP COLUMN "links",
ADD COLUMN     "callRequestedAt" TIMESTAMP(3),
ADD COLUMN     "contact" TEXT NOT NULL DEFAULT '';

