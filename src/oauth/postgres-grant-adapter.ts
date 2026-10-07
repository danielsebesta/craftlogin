import { createHash } from 'node:crypto';

import { errors, type Adapter, type AdapterPayload } from 'oidc-provider';
import { z } from 'zod';

import type { PrismaClient } from '../generated/prisma/client.js';
import { english } from '../locales/en.js';

const grantSchema = z.looseObject({ accountId: z.uuid(), clientId: z.string().min(1).max(64) });
const payloadSchema = z.record(z.string(), z.unknown());

export function grantDigest(id: string): string {
  return createHash('sha256').update(id, 'utf8').digest('hex');
}

/** The provider's grant is the durable authority, including authorizations without refresh tokens. */
export class PostgresGrantAdapter implements Adapter {
  public constructor(private readonly database: PrismaClient) {}

  public async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    if (expiresIn === undefined || !Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
      throw new TypeError('Grants require a positive TTL');
    }
    if (typeof payload.exp === 'number' && payload.exp <= Math.floor(Date.now() / 1000))
      throw new errors.InvalidGrant(english.api.oauthArtifactUnavailable);
    const grant = grantSchema.parse(payload);
    const stored = { ...payload };
    delete stored.jti;
    const hash = grantDigest(id);
    const expiresAt = new Date(Date.now() + expiresIn * 1_000);
    // Revoked rows are tombstones until expiry: a stale provider object cannot resurrect consent.
    const count = await this.database.$executeRaw`
      INSERT INTO "OidcGrant" ("grantIdHash", "clientId", "userUuid", "expiresAt", "adapterPayload")
      VALUES (${hash}, ${grant.clientId}, ${grant.accountId}::uuid, ${expiresAt}, ${JSON.stringify(stored)}::jsonb)
      ON CONFLICT ("grantIdHash") DO UPDATE
      SET "adapterPayload" = EXCLUDED."adapterPayload", "expiresAt" = EXCLUDED."expiresAt"
      WHERE "OidcGrant"."revokedAt" IS NULL
        AND "OidcGrant"."clientId" = EXCLUDED."clientId"
        AND "OidcGrant"."userUuid" = EXCLUDED."userUuid"
    `;
    if (count !== 1) throw new errors.InvalidGrant(english.api.oauthArtifactUnavailable);
  }

  public async find(id: string): Promise<AdapterPayload | undefined> {
    const record = await this.database.oidcGrant.findFirst({
      where: { grantIdHash: grantDigest(id), revokedAt: null, expiresAt: { gt: new Date() } },
      select: { adapterPayload: true },
    });
    return record === null ? undefined : { ...payloadSchema.parse(record.adapterPayload), jti: id };
  }

  public async destroy(id: string): Promise<void> {
    await this.database.oidcGrant.updateMany({
      where: { grantIdHash: grantDigest(id), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  public async revokeByGrantId(id: string): Promise<void> {
    await this.destroy(id);
  }
  public findByUid(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
  public findByUserCode(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
  public consume(): Promise<void> {
    return Promise.resolve();
  }
}
