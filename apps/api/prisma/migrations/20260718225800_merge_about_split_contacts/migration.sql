-- AlterTable
ALTER TABLE "ProProfile" DROP COLUMN "achievements";

-- AlterTable
ALTER TABLE "VerificationRequest" DROP COLUMN "contact",
ADD COLUMN     "contactPhone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactTelegram" TEXT NOT NULL DEFAULT '';

