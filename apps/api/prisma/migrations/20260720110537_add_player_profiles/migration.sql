-- CreateEnum
CREATE TYPE "PlayerLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'COMPETITIVE');

-- CreateEnum
CREATE TYPE "Handedness" AS ENUM ('LEFT', 'RIGHT');

-- CreateEnum
CREATE TYPE "Grip" AS ENUM ('SHAKEHAND', 'PENHOLD');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarKey" TEXT;

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "PlayerLevel" NOT NULL DEFAULT 'BEGINNER',
    "yearsOfExperience" INTEGER,
    "handedness" "Handedness",
    "grip" "Grip",
    "about" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_userId_key" ON "PlayerProfile"("userId");

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
