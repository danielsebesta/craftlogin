-- Skin verification cannot warn the player, so existing clients stop offering it until they opt in.
ALTER TABLE "App" ADD COLUMN "skinVerificationEnabled" BOOLEAN NOT NULL DEFAULT false;
