CREATE TABLE "OidcGrant" (
    "grantIdHash" VARCHAR(64) NOT NULL,
    "clientId" VARCHAR(64) NOT NULL,
    "userUuid" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "adapterPayload" JSONB NOT NULL,
    CONSTRAINT "OidcGrant_pkey" PRIMARY KEY ("grantIdHash"),
    CONSTRAINT "OidcGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "App"("clientId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OidcGrant_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OidcGrant_userUuid_clientId_expiresAt_idx" ON "OidcGrant"("userUuid", "clientId", "expiresAt");
CREATE INDEX "OidcGrant_expiresAt_idx" ON "OidcGrant"("expiresAt");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
