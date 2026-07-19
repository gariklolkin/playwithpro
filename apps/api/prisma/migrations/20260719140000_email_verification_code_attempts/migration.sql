-- Email verification moves from links to 6-digit codes; track wrong attempts.
ALTER TABLE "VerificationToken" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
