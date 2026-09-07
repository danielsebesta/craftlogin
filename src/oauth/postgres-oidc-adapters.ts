import { createHash } from 'node:crypto';

import type { Adapter, AdapterPayload } from 'oidc-provider';
import { errors } from 'oidc-provider';
import { z } from 'zod';

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { english } from '../locales/en.js';
import { authenticatedMinecraftPlayerSchema } from '../verification/types.js';
import { clientSecretHashSchema, hashClientSecret } from './client-secret.js';
import { redirectUriSchema } from './redirect-uri.js';

const clientIdSchema = z.string().min(1).max(64);
const adapterPayloadSchema = z.record(z.string(), z.unknown());
const storedClientSchema = z.object({
  clientId: clientIdSchema,
  clientSecretHash: clientSecretHashSchema.nullable(),
  name: z.string().min(1).max(100),
  redirectUris: z.array(redirectUriSchema).min(1),
});
const clientUpsertSchema = z.object({
  client_id: clientIdSchema,
  client_name: z.string().min(1).max(100).optional(),
  client_secret: z.string().min(1).max(1_024).optional(),
  redirect_uris: z.array(redirectUriSchema).min(1),
});
const refreshTokenPayloadSchema = z.looseObject({
  accountId: authenticatedMinecraftPlayerSchema.shape.uuid,
  clientId: clientIdSchema,
  grantId: z.string().min(1).max(512),
});

export class PostgresClientAdapter implements Adapter {
  public constructor(private readonly database: PrismaClient) {}

  public async upsert(id: string, payload: AdapterPayload): Promise<void> {
    const client = clientUpsertSchema.parse(payload);
    if (id !== client.client_id) {
      throw new TypeError('OIDC client adapter id does not match client_id');
    }
    const existingHash = client.client_secret
      ? clientSecretHashSchema.safeParse(client.client_secret)
      : null;
    const clientSecretHash =
      client.client_secret === undefined
        ? null
        : existingHash?.success === true
          ? existingHash.data
          : await hashClientSecret(client.client_secret);

    await this.database.app.upsert({
      where: { clientId: client.client_id },
      create: {
        clientId: client.client_id,
        clientSecretHash,
        name: client.client_name ?? client.client_id,
        redirectUris: client.redirect_uris,
      },
      update: {
        clientSecretHash,
        name: client.client_name ?? client.client_id,
        redirectUris: client.redirect_uris,
      },
    });
  }

  public async find(id: string): Promise<AdapterPayload | undefined> {
    const record = await this.database.app.findUnique({
      where: { clientId: id },
      select: {
        clientId: true,
        clientSecretHash: true,
        name: true,
        redirectUris: true,
      },
    });
    if (record === null) {
      return undefined;
    }

    const client = storedClientSchema.parse(record);
    return {
      application_type: 'web',
      client_id: client.clientId,
      client_name: client.name,
      client_secret: client.clientSecretHash ?? undefined,
      grant_types: ['authorization_code', 'refresh_token'],
      redirect_uris: client.redirectUris,
      response_types: ['code'],
      token_endpoint_auth_method: client.clientSecretHash === null ? 'none' : 'client_secret_basic',
    };
  }

  public findByUserCode(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  public findByUid(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  public consume(): Promise<void> {
    return Promise.resolve();
  }

  public async destroy(id: string): Promise<void> {
    await this.database.app.deleteMany({ where: { clientId: id } });
  }

  public revokeByGrantId(): Promise<void> {
    return Promise.resolve();
  }
}

export class PostgresRefreshTokenAdapter implements Adapter {
  public constructor(private readonly database: PrismaClient) {}

  public async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const ttlSeconds = requiredTtl(expiresIn);
    const token = refreshTokenPayloadSchema.parse(payload);
    const tokenHash = digest(id);

    await this.database.refreshToken.upsert({
      where: { tokenHash },
      create: {
        tokenHash,
        clientId: token.clientId,
        userUuid: token.accountId,
        expiresAt: new Date(Date.now() + ttlSeconds * 1_000),
        grantIdHash: digest(token.grantId),
        adapterPayload: toPrismaJsonObject(payload),
      },
      update: {
        clientId: token.clientId,
        userUuid: token.accountId,
        expiresAt: new Date(Date.now() + ttlSeconds * 1_000),
        grantIdHash: digest(token.grantId),
        adapterPayload: toPrismaJsonObject(payload),
      },
    });
  }

  public async find(id: string): Promise<AdapterPayload | undefined> {
    const record = await this.database.refreshToken.findFirst({
      where: { tokenHash: digest(id), expiresAt: { gt: new Date() } },
      select: { adapterPayload: true, revokedAt: true },
    });
    if (record === null) {
      return undefined;
    }

    const payload = adapterPayloadSchema.parse(record.adapterPayload);
    return {
      ...payload,
      jti: id,
      consumed: record.revokedAt === null ? payload['consumed'] : toEpochSeconds(record.revokedAt),
    };
  }

  public findByUserCode(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  public findByUid(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  public async consume(id: string): Promise<void> {
    const result = await this.database.refreshToken.updateMany({
      where: {
        tokenHash: digest(id),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new errors.InvalidGrant(english.api.oauthArtifactUnavailable);
    }
  }

  public async destroy(id: string): Promise<void> {
    await this.database.refreshToken.deleteMany({ where: { tokenHash: digest(id) } });
  }

  public async revokeByGrantId(grantId: string): Promise<void> {
    await this.database.refreshToken.deleteMany({ where: { grantIdHash: digest(grantId) } });
  }
}

function toPrismaJsonObject(payload: AdapterPayload): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'jti' || value === undefined) {
      continue;
    }
    result[key] = toPrismaJsonValue(value);
  }
  return result;
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('OIDC adapter payload contains a non-finite number');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toPrismaJsonValue);
  }
  if (typeof value === 'object') {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue !== undefined) {
        result[key] = toPrismaJsonValue(nestedValue);
      }
    }
    return result;
  }
  throw new TypeError('OIDC adapter payload contains a non-JSON value');
}

function requiredTtl(expiresIn: number | undefined): number {
  if (expiresIn === undefined || !Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
    throw new TypeError('Refresh-token adapter records require a positive integer TTL');
  }
  return expiresIn;
}

function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1_000);
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
