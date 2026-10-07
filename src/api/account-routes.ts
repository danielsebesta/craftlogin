import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

import { LastAdministratorError, OwnerAccessError } from '../developers/developer-repository.js';
import { english } from '../locales/en.js';
import { RedisOidcAdapter } from '../oauth/redis-oidc-adapter.js';
import {
  accountDeleteToken,
  accountRevokeToken,
  OIDC_INTERACTION_COOKIE,
  OIDC_INTERACTION_SIGNATURE_COOKIE,
  OIDC_RESUME_COOKIE,
  OIDC_RESUME_SIGNATURE_COOKIE,
  OIDC_SESSION_COOKIE,
  OIDC_SESSION_SIGNATURE_COOKIE,
  readAccountSession,
  revokeTokenMatches,
  type AccountSession,
} from './account-session.js';
import {
  renderAccountPage,
  renderAccountSignedOutPage,
  type ConnectedServiceView,
} from './account-page.js';
import type { DeveloperAccessRepository } from '../developers/developer-repository.js';
import type { CurrentUserLookup } from './current-user.js';
import { ApiError } from './errors.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';
import {
  accountDeleteRateLimit,
  accountPageRateLimit,
  accountRevokeRateLimit,
} from './rate-limit.js';
import {
  accountDeleteRouteSchema,
  accountPageRouteSchema,
  accountRevokeRouteSchema,
} from './schemas.js';

interface ConnectedGrantRow {
  readonly adapterPayload: unknown;
  readonly app: {
    readonly iconHash: string | null;
    readonly name: string;
    readonly verifiedAt: Date | null;
  };
  readonly clientId: string;
  readonly expiresAt: Date;
  readonly grantIdHash: string;
}

/** The exact Prisma surface the account page needs; the real client satisfies it. */
export interface AccountTokenStore {
  readonly oidcGrant: {
    updateMany(options: {
      where: { clientId?: string; revokedAt: null; userUuid: string };
      data: { revokedAt: Date };
    }): Promise<{ count: number }>;
    findMany(options: {
      select: {
        adapterPayload: true;
        app: { select: { iconHash: true; name: true; verifiedAt: true } };
        clientId: true;
        expiresAt: true;
        grantIdHash: true;
      };
      where: {
        clientId?: string;
        expiresAt: { gt: Date };
        revokedAt: null;
        userUuid: string;
      };
    }): Promise<readonly ConnectedGrantRow[]>;
  };
  readonly user: {
    // User deletion cascades grants and refresh tokens.
    deleteMany(options: { where: { uuid: string } }): Promise<{ count: number }>;
  };
}

const connectedGrantSelect = {
  adapterPayload: true,
  app: { select: { iconHash: true, name: true, verifiedAt: true } },
  clientId: true,
  expiresAt: true,
  grantIdHash: true,
} as const;

const connectedGrantPayloadSchema = z.looseObject({
  grantId: z.string().min(1).max(512).optional(),
  iat: z.number().int().positive().optional(),
  scope: z.string().optional(),
  openid: z.object({ scope: z.string().optional() }).optional(),
});

interface AccountPageQuery {
  readonly revoked?: string;
}

interface AccountRevokeBody {
  readonly client: string;
  readonly token: string;
}

interface AccountDeleteBody {
  readonly token: string;
}

export interface AccountRoutesOptions {
  readonly cookieKeys: readonly string[];
  readonly database: AccountTokenStore;
  readonly developers: Pick<DeveloperAccessRepository, 'revoke'>;
  readonly logger: Pick<FastifyBaseLogger, 'info' | 'warn'>;
  readonly redis: Pick<Redis, 'eval' | 'get'>;
  readonly users: CurrentUserLookup;
}

export function registerAccountRoutes(
  server: FastifyInstance,
  options: AccountRoutesOptions,
): void {
  const signingKey = options.cookieKeys[0];
  if (signingKey === undefined) {
    throw new TypeError('A cookie signing key is required for the account page');
  }
  const sessions = new RedisOidcAdapter('Session', options.redis);

  server.get<{ Querystring: AccountPageQuery }>(
    '/account',
    { config: { rateLimit: accountPageRateLimit }, schema: accountPageRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await readAccountSession(
        request,
        options.cookieKeys,
        sessions,
        options.logger,
      );
      setAccountPageHeaders(reply);
      if (session === undefined) {
        await reply.type('text/html; charset=utf-8').send(renderAccountSignedOutPage());
        return;
      }
      const [user, tokens] = await Promise.all([
        options.users.findCurrentUser(session.accountId),
        options.database.oidcGrant.findMany({
          select: connectedGrantSelect,
          where: { expiresAt: { gt: new Date() }, revokedAt: null, userUuid: session.accountId },
        }),
      ]);
      await reply.type('text/html; charset=utf-8').send(
        renderAccountPage({
          accountUuid: session.accountId,
          deleteToken: accountDeleteToken(signingKey, session.jti),
          ...(request.query.revoked === '1' ? { notice: 'revoked' as const } : {}),
          services: groupConnectedServices(tokens, signingKey, session),
          signedInAtSeconds: session.issuedAtSeconds,
          ...(user === undefined ? {} : { username: user.username }),
        }),
      );
    },
  );

  server.post<{ Body: AccountRevokeBody }>(
    '/account/revoke',
    { config: { rateLimit: accountRevokeRateLimit }, schema: accountRevokeRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await readAccountSession(
        request,
        options.cookieKeys,
        sessions,
        options.logger,
      );
      if (session === undefined) {
        await reply.redirect('/account', 303);
        return;
      }
      const { client, token } = request.body;
      if (!revokeTokenMatches(accountRevokeToken(signingKey, session.jti, client), token)) {
        throw new ApiError(403, 'forbidden', english.api.errors.csrfInvalid);
      }
      // This single write revokes authorizations, including those without a
      // refresh token. Token issuance locks the same grant row; all adapters
      // reject revoked grants, even if an in-flight Redis write finishes later.
      const removed = await options.database.oidcGrant.updateMany({
        where: { clientId: client, userUuid: session.accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      options.logger.info(
        { clientId: client, removed: removed.count, userUuid: session.accountId },
        'Account revoked application authorizations',
      );
      await reply.redirect('/account?revoked=1', 303);
    },
  );

  server.post<{ Body: AccountDeleteBody }>(
    '/account/delete',
    { config: { rateLimit: accountDeleteRateLimit }, schema: accountDeleteRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await readAccountSession(
        request,
        options.cookieKeys,
        sessions,
        options.logger,
      );
      if (session === undefined) {
        await reply.redirect('/account', 303);
        return;
      }
      if (!revokeTokenMatches(accountDeleteToken(signingKey, session.jti), request.body.token)) {
        throw new ApiError(403, 'forbidden', english.api.errors.csrfInvalid);
      }
      // A developer/admin access row is revoked too; the protected invariants
      // (configured owner, last administrator) win and keep the row.
      try {
        await options.developers.revoke(session.accountId);
      } catch (error: unknown) {
        if (!(error instanceof OwnerAccessError) && !(error instanceof LastAdministratorError)) {
          throw error;
        }
        options.logger.info(
          { userUuid: session.accountId },
          'Account deletion kept a protected developer role',
        );
      }
      await options.database.oidcGrant.updateMany({
        where: { userUuid: session.accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await sessions.invalidateAccountSessions(session.accountId);
      await sessions.destroy(session.jti);
      await options.database.user.deleteMany({ where: { uuid: session.accountId } });
      clearOidcCookies(reply);
      options.logger.info({ userUuid: session.accountId }, 'Account identity erased');
      await reply.redirect('/account', 303);
    },
  );
}

function tokenMetadata(payload: unknown): {
  readonly grantId?: string | undefined;
  readonly iat?: number | undefined;
  readonly scope?: string | undefined;
} {
  const parsed = connectedGrantPayloadSchema.safeParse(payload);
  return parsed.success
    ? { ...parsed.data, scope: parsed.data.openid?.scope ?? parsed.data.scope }
    : {};
}

function groupConnectedServices(
  tokens: readonly ConnectedGrantRow[],
  signingKey: string,
  session: AccountSession,
): ConnectedServiceView[] {
  interface ServiceGroup {
    iconHash: string | null;
    name: string;
    rowCount: number;
    scopes: Set<string>;
    signedInAtSeconds?: number;
    validUntil: Date;
    verified: boolean;
  }
  const groups = new Map<string, ServiceGroup>();
  for (const row of tokens) {
    const metadata = tokenMetadata(row.adapterPayload);
    const existing = groups.get(row.clientId);
    if (existing === undefined) {
      groups.set(row.clientId, {
        iconHash: row.app.iconHash,
        name: row.app.name,
        rowCount: 1,
        scopes: scopeSet(metadata.scope),
        validUntil: row.expiresAt,
        verified: row.app.verifiedAt !== null,
        ...(metadata.iat === undefined ? {} : { signedInAtSeconds: metadata.iat }),
      });
      continue;
    }
    existing.rowCount += 1;
    if (row.expiresAt > existing.validUntil) {
      existing.validUntil = row.expiresAt;
    }
    if (
      metadata.iat !== undefined &&
      (existing.signedInAtSeconds === undefined || metadata.iat < existing.signedInAtSeconds)
    ) {
      existing.signedInAtSeconds = metadata.iat;
    }
    for (const scope of scopeSet(metadata.scope)) {
      existing.scopes.add(scope);
    }
  }
  return [...groups.entries()]
    .map(([clientId, group]): ConnectedServiceView => ({
      clientId,
      ...(group.iconHash === null
        ? {}
        : {
            iconUrl: `/api/apps/${encodeURIComponent(clientId)}/icon?v=${encodeURIComponent(group.iconHash)}`,
          }),
      name: group.name,
      revokeToken: accountRevokeToken(signingKey, session.jti, clientId),
      scopes: [...group.scopes].sort(),
      sessionCount: group.rowCount,
      ...(group.signedInAtSeconds === undefined
        ? {}
        : { signedInAtSeconds: group.signedInAtSeconds }),
      validUntil: group.validUntil,
      verified: group.verified,
    }))
    .sort((a, b): number => a.name.localeCompare(b.name) || a.clientId.localeCompare(b.clientId));
}

function scopeSet(scope: string | undefined): Set<string> {
  return new Set((scope ?? '').split(/\s+/u).filter((token): boolean => token.length > 0));
}

function clearOidcCookies(reply: FastifyReply): void {
  const attributes = { httpOnly: true, path: '/', sameSite: 'lax', secure: true } as const;
  for (const name of [
    OIDC_SESSION_COOKIE,
    OIDC_SESSION_SIGNATURE_COOKIE,
    OIDC_INTERACTION_COOKIE,
    OIDC_INTERACTION_SIGNATURE_COOKIE,
    OIDC_RESUME_COOKIE,
    OIDC_RESUME_SIGNATURE_COOKIE,
  ]) {
    void reply.clearCookie(name, attributes);
  }
}

function setAccountPageHeaders(reply: FastifyReply): void {
  void reply.headers({
    'cache-control': 'no-store',
    'content-security-policy': PAGE_CONTENT_SECURITY_POLICY,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
}
