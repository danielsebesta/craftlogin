-- AlterTable
ALTER TABLE "App"
ADD COLUMN "verificationNote" VARCHAR(500),
ADD COLUMN "verificationRequestedAt" TIMESTAMPTZ(3),
ADD COLUMN "verifiedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Developer" ADD COLUMN "verifiedAt" TIMESTAMPTZ(3);
