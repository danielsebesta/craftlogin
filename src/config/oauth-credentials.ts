import { generateKeyPairSync, randomUUID } from 'node:crypto';

import type { JWK, JWKS } from 'oidc-provider';
import { z } from 'zod';

const cookieKeysSchema = z
  .array(z.string().min(32))
  .min(2)
  .refine((keys): boolean => new Set(keys).size === keys.length, 'Cookie keys must be distinct');
const jwkSchema = z.object({
  alg: z.string().optional(),
  crv: z.string().optional(),
  d: z.string().min(1),
  dp: z.string().optional(),
  dq: z.string().optional(),
  e: z.string().optional(),
  ext: z.boolean().optional(),
  k: z.string().optional(),
  key_ops: z.array(z.string()).optional(),
  kid: z.string().optional(),
  kty: z.string().min(1),
  n: z.string().optional(),
  p: z.string().optional(),
  q: z.string().optional(),
  qi: z.string().optional(),
  use: z.string().optional(),
  x: z.string().optional(),
  x5c: z.array(z.string()).optional(),
  y: z.string().optional(),
});
const jwksSchema = z.object({ keys: z.array(jwkSchema).min(1) });

export interface OAuthCredentials {
  readonly cookieKeys: readonly string[];
  readonly jwks: JWKS;
}

export function loadOAuthCredentials(
  source: NodeJS.ProcessEnv,
  nodeEnvironment: 'development' | 'production' | 'test',
): OAuthCredentials {
  const rawCookieKeys = source['OIDC_COOKIE_KEYS'];
  const cookieKeys = cookieKeysSchema.parse(
    rawCookieKeys === undefined
      ? nodeEnvironment === 'production'
        ? undefined
        : ['development-cookie-key-a'.padEnd(48, 'a'), 'development-cookie-key-b'.padEnd(48, 'b')]
      : rawCookieKeys.split(','),
  );

  const rawJwks = source['OIDC_JWKS'];
  return {
    cookieKeys,
    jwks:
      rawJwks === undefined
        ? nodeEnvironment === 'production'
          ? jwksSchema.parse(undefined)
          : createDevelopmentJwks()
        : parseJwks(rawJwks),
  };
}

function parseJwks(raw: string): JWKS {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    throw new Error('OIDC_JWKS must contain valid JSON', { cause: error });
  }
  const jwks = jwksSchema.parse(parsed);
  return { keys: jwks.keys };
}

function createDevelopmentJwks(): JWKS {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2_048 });
  const exported: JWK = privateKey.export({ format: 'jwk' });
  return {
    keys: [
      {
        ...exported,
        alg: 'RS256',
        kid: `development-${randomUUID()}`,
        use: 'sig',
      },
    ],
  };
}
