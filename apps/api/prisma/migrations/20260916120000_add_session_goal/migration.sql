-- Optional session goal set by the player at booking ("what should we focus on?").
ALTER TABLE "Session" ADD COLUMN "goal" VARCHAR(500);
