-- CreateEnum
CREATE TYPE "DeveloperRole" AS ENUM ('DEVELOPER', 'ADMIN');

-- CreateTable
CREATE TABLE "Developer" (
    "uuid" UUID NOT NULL,
    "role" "DeveloperRole" NOT NULL DEFAULT 'DEVELOPER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Developer_pkey" PRIMARY KEY ("uuid")
);

-- AlterTable
ALTER TABLE "App" ADD COLUMN "ownerUuid" UUID;

-- CreateIndex
CREATE INDEX "App_ownerUuid_createdAt_idx" ON "App"("ownerUuid", "createdAt");

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_ownerUuid_fkey" FOREIGN KEY ("ownerUuid") REFERENCES "Developer"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
