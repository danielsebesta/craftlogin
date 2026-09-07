-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "uuid" UUID NOT NULL,
    "username" VARCHAR(16) NOT NULL,
    "firstVerifiedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "App" (
    "id" UUID NOT NULL,
    "clientId" VARCHAR(64) NOT NULL,
    "clientSecretHash" VARCHAR(255),
    "name" VARCHAR(100) NOT NULL,
    "redirectUris" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "tokenHash" VARCHAR(64) NOT NULL,
    "clientId" VARCHAR(64) NOT NULL,
    "userUuid" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "App_clientId_key" ON "App"("clientId");

-- CreateIndex
CREATE INDEX "RefreshToken_clientId_expiresAt_idx" ON "RefreshToken"("clientId", "expiresAt");

-- CreateIndex
CREATE INDEX "RefreshToken_userUuid_expiresAt_idx" ON "RefreshToken"("userUuid", "expiresAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "App"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
