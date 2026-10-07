import { isIP } from 'node:net';
import { z } from 'zod';

const portSchema = z
  .string()
  .regex(/^[1-9]\d{0,4}$/u, 'must be a decimal TCP port')
  .transform((value): number => Number.parseInt(value, 10))
  .pipe(z.number().int().min(1).max(65_535));

const redisUrlSchema = z
  .url()
  .refine(
    (value): boolean => value.startsWith('redis://') || value.startsWith('rediss://'),
    'must use redis:// or rediss://',
  );

const postgresUrlSchema = z
  .url()
  .refine(
    (value): boolean => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'must use postgres:// or postgresql://',
  );

const issuerSchema = z
  .url()
  .refine(
    (value): boolean => value.startsWith('http://') || value.startsWith('https://'),
    'must use http:// or https://',
  )
  .refine((value): boolean => {
    const parsed = URL.parse(value);
    return parsed?.origin === value;
  }, 'must be an origin without a path, query, or fragment');

const booleanSchema = z.enum(['false', 'true']).transform((value): boolean => value === 'true');

const baseDomainSchema = z
  .string()
  .min(1)
  .max(244)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u,
    'must be a lowercase DNS name',
  );

const environmentSchema = z
  .object({
    nodeEnvironment: z.enum(['development', 'test', 'production']),
    logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']),
    databaseUrl: postgresUrlSchema,
    databasePoolMax: z
      .string()
      .regex(/^[1-9]\d?$/u)
      .transform(Number),
    cacheRedisUrl: redisUrlSchema,
    developerOwner: z.string().min(1).max(64).optional(),
    httpHost: z.string().min(1),
    httpPort: portSchema,
    httpTrustProxy: booleanSchema,
    httpTrustedProxies: z
      .string()
      .transform((value) => value.split(',').map((entry) => entry.trim()))
      .refine(
        (entries) =>
          entries.length > 0 &&
          entries.every((entry) => {
            const [address, prefix, extra] = entry.split('/');
            const version = address === undefined ? 0 : isIP(address);
            return (
              extra === undefined &&
              version !== 0 &&
              (prefix === undefined ||
                (/^\d{1,3}$/u.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128)))
            );
          }),
        'must be comma-separated proxy IP addresses or CIDRs',
      )
      .optional(),
    oidcIssuer: issuerSchema,
    redisUrl: redisUrlSchema,
    minecraftHost: z.string().min(1),
    minecraftPort: portSchema,
    minecraftBaseDomain: baseDomainSchema,
  })
  .superRefine((environment, context): void => {
    if (environment.nodeEnvironment === 'production') {
      const auth = new URL(environment.redisUrl);
      const cache = new URL(environment.cacheRedisUrl);
      if (auth.hostname === cache.hostname && auth.port === cache.port) {
        context.addIssue({
          code: 'custom',
          message: 'cache requires a separate Redis server',
          path: ['cacheRedisUrl'],
        });
      }
    }
    if (
      environment.nodeEnvironment === 'production' &&
      !environment.oidcIssuer.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'must use HTTPS in production',
        path: ['oidcIssuer'],
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const nodeEnvironment = source['NODE_ENV'] ?? 'development';
  return environmentSchema.parse({
    nodeEnvironment,
    databasePoolMax: source['DATABASE_POOL_MAX'] ?? '10',
    cacheRedisUrl:
      source['CACHE_REDIS_URL'] ??
      (nodeEnvironment === 'production' ? undefined : 'redis://localhost:6380'),
    logLevel: source['LOG_LEVEL'] ?? 'info',
    databaseUrl:
      source['DATABASE_URL'] ??
      (nodeEnvironment === 'production'
        ? undefined
        : 'postgresql://craftlogin:craftlogin-dev-only@localhost:5432/craftlogin?schema=public'),
    developerOwner: source['DEVELOPER_OWNER'] === '' ? undefined : source['DEVELOPER_OWNER'],
    redisUrl:
      source['REDIS_URL'] ??
      (nodeEnvironment === 'production' ? undefined : 'redis://localhost:6379'),
    httpHost: source['HTTP_HOST'] ?? '0.0.0.0',
    httpPort: source['HTTP_PORT'] ?? '3000',
    httpTrustProxy: source['HTTP_TRUST_PROXY'] ?? 'false',
    httpTrustedProxies:
      source['HTTP_TRUSTED_PROXIES'] === '' ? undefined : source['HTTP_TRUSTED_PROXIES'],
    oidcIssuer:
      source['OIDC_ISSUER'] ??
      (nodeEnvironment === 'production' ? undefined : 'http://localhost:3000'),
    minecraftHost: source['MC_HOST'] ?? '0.0.0.0',
    minecraftPort: source['MC_PORT'] ?? '25565',
    minecraftBaseDomain: source['MC_BASE_DOMAIN'] ?? 'craftlogin.com',
  });
}
