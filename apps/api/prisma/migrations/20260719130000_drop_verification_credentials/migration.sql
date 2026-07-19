-- The identity call replaced free-form credentials; drop the unused column.
ALTER TABLE "VerificationRequest" DROP COLUMN "credentials";
