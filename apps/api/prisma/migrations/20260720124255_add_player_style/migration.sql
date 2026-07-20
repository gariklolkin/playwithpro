-- CreateEnum
CREATE TYPE "PlayingStyle" AS ENUM ('OFFENSIVE', 'ALL_ROUND', 'DEFENSIVE');

-- AlterTable
ALTER TABLE "PlayerProfile" ADD COLUMN     "style" "PlayingStyle";
