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
    httpHost: z.string().min(1),
    httpPort: portSchema,
    httpTrustProxy: booleanSchema,
    oidcIssuer: issuerSchema,
    redisUrl: redisUrlSchema,
    minecraftHost: z.string().min(1),
    minecraftPort: portSchema,
    minecraftBaseDomain: baseDomainSchema,
  })
  .superRefine((environment, context): void => {
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
    logLevel: source['LOG_LEVEL'] ?? 'info',
    databaseUrl:
      source['DATABASE_URL'] ??
      'postgresql://craftlogin:craftlogin-dev-only@localhost:5432/craftlogin?schema=public',
    redisUrl: source['REDIS_URL'] ?? 'redis://localhost:6379',
    httpHost: source['HTTP_HOST'] ?? '0.0.0.0',
    httpPort: source['HTTP_PORT'] ?? '3000',
    httpTrustProxy: source['HTTP_TRUST_PROXY'] ?? 'false',
    oidcIssuer:
      source['OIDC_ISSUER'] ??
      (nodeEnvironment === 'production' ? undefined : 'http://localhost:3000'),
    minecraftHost: source['MC_HOST'] ?? '0.0.0.0',
    minecraftPort: source['MC_PORT'] ?? '25565',
    minecraftBaseDomain: source['MC_BASE_DOMAIN'] ?? 'craftlogin.com',
  });
}
