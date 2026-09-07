-- AlterTable
ALTER TABLE "RefreshToken"
ADD COLUMN "grantIdHash" VARCHAR(64),
ADD COLUMN "adapterPayload" JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE "RefreshToken" ALTER COLUMN "adapterPayload" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "RefreshToken_grantIdHash_idx" ON "RefreshToken"("grantIdHash");
