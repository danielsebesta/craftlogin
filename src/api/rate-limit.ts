import rateLimit, { normalizeIP } from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';

import { english } from '../locales/en.js';
import { ApiError } from './errors.js';

export const appRegistrationRateLimit = {
  groupId: 'app-registration',
  max: 5,
  timeWindow: 60 * 60 * 1_000,
};

// Same abuse profile as app registration, but its own bucket.
export const developerAppVerificationRateLimit = {
  groupId: 'developer-app-verification',
  max: appRegistrationRateLimit.max,
  timeWindow: appRegistrationRateLimit.timeWindow,
};

export const tokenRateLimit = {
  groupId: 'oauth-token',
  keyGenerator: (request: FastifyRequest): string => `token:${normalizeIP(request.ip)}`,
  max: 1200,
  timeWindow: 60 * 1_000,
};

// This shared admission ceiling complements the bounded Argon2 work queue. Runs via createRateLimit() — a second rateLimit()
// hook would be skipped — and the constant key makes the bucket global.
export const tokenEndpointGlobalRateLimit = {
  groupId: 'oauth-grant-global',
  keyGenerator: (): string => 'oauth-grant-global',
  max: 6000,
  timeWindow: 60 * 1_000,
};

// Each authorize call creates an interaction record in Redis; the keyGenerator
// prefix keeps this bucket separate from limiters sharing one store prefix.
export const authorizeRateLimit = {
  groupId: 'oauth-authorize',
  keyGenerator: (request: FastifyRequest): string => `authorize:${normalizeIP(request.ip)}`,
  max: 2400,
  timeWindow: 60 * 1_000,
};

// Cheap unauthenticated OIDC endpoints (jwks, discovery, webfinger, userinfo,
// logout) share one per-address bucket; token and authorize keep their
// stricter dedicated budgets.
export const publicOidcRateLimit = {
  groupId: 'oauth-public',
  keyGenerator: (request: FastifyRequest): string => `public:${normalizeIP(request.ip)}`,
  max: 2400,
  timeWindow: 60 * 1_000,
};

// The interaction page render hits Postgres (client + owner) on every load.
export const interactionPageRateLimit = {
  groupId: 'interaction-page',
  max: 2400,
  timeWindow: 60 * 1_000,
};

// Same profile as the interaction page: a Redis session read plus a Postgres
// token listing on every render.
export const accountPageRateLimit = {
  groupId: 'account-page',
  max: interactionPageRateLimit.max,
  timeWindow: interactionPageRateLimit.timeWindow,
};

export const accountRevokeRateLimit = {
  groupId: 'account-revoke',
  max: 30,
  timeWindow: 60 * 1_000,
};

export const accountDeleteRateLimit = {
  groupId: 'account-delete',
  max: 30,
  timeWindow: 60 * 1_000,
};

export const developerLoginPageRateLimit = {
  groupId: 'developer-login-page',
  max: 120,
  timeWindow: 60 * 1_000,
};

// Status needs an unguessable interaction id plus the signed session cookie, so
// this is volumetric protection tolerant of polling tabs behind one shared IP.
export const verificationStatusRateLimit = {
  groupId: 'verification-status',
  keyGenerator: (request: FastifyRequest): string => {
    const params = request.params;
    const uid =
      typeof params === 'object' &&
      params !== null &&
      'uid' in params &&
      typeof params.uid === 'string'
        ? params.uid
        : '';
    return `status:${normalizeIP(request.ip)}:${uid}`;
  },
  max: 120,
  timeWindow: 60 * 1_000,
};

// Same budget as status polling, but an independent bucket so background polls
// can't block a provider callback.
export const microsoftVerificationRateLimit = {
  groupId: 'microsoft-verification',
  max: verificationStatusRateLimit.max,
  timeWindow: verificationStatusRateLimit.timeWindow,
};

export const skinVerificationStartRateLimit = {
  groupId: 'skin-verification-start',
  max: 10,
  timeWindow: 60 * 60 * 1_000,
};

export const skinVerificationLookupRateLimit = {
  groupId: 'skin-verification-lookup',
  max: 30,
  timeWindow: 60 * 1_000,
};

export const avatarRenderRateLimit = {
  groupId: 'avatar-render',
  max: 60,
  timeWindow: 60 * 1_000,
};

export const avatarRawRateLimit = {
  groupId: 'avatar-raw',
  max: 120,
  timeWindow: 60 * 1_000,
};

export const playerProfileRateLimit = {
  groupId: 'player-profile',
  max: 120,
  timeWindow: 60 * 1_000,
};

// Icons are cached hard; this is only volumetric protection for the DB read behind an uncached URL.
export const appIconReadRateLimit = {
  groupId: 'app-icon-read',
  max: 240,
  timeWindow: 60 * 1_000,
};

// The CSP collector is a telemetry sink; a strict ceiling bounds log volume
// while staying far above real browser report rates.
export const cspReportRateLimit = {
  groupId: 'csp-report',
  max: 60,
  timeWindow: 60 * 1_000,
};

// An independent bucket keeps an icon refresh loop off the registration budget.
export const appIconWriteRateLimit = {
  groupId: 'app-icon-write',
  max: 20,
  timeWindow: 60 * 60 * 1_000,
};

// Redirect edits and secret rotations share one write bucket apart from
// registration, so iterating during development cannot drain either budget.
export const developerAppUpdateRateLimit = {
  groupId: 'developer-app-update',
  max: appIconWriteRateLimit.max,
  timeWindow: appIconWriteRateLimit.timeWindow,
};

export async function registerRateLimiting(
  server: FastifyInstance,
  redis?: Redis,
  namespace = 'craftlogin:rate-limit:',
): Promise<void> {
  const options = {
    errorResponseBuilder: buildRateLimitError,
    global: false,
    nameSpace: namespace,
    skipOnError: false,
  };

  await server.register(rateLimit, redis === undefined ? options : { ...options, redis });
  // Bound novel interaction ids as well as repeated polling of one id.
  const checkPollingAddress = server.createRateLimit({
    keyGenerator: (request: FastifyRequest): string => `poll-address:${normalizeIP(request.ip)}`,
    max: 30000,
    timeWindow: 60 * 1000,
  });
  server.addHook('onRequest', async (request, reply): Promise<void> => {
    const route = request.routeOptions.url;
    if (route !== '/interaction/:uid/status' && route !== '/interaction/:uid/skin/status') return;
    const result = await checkPollingAddress(request);
    if (!result.isAllowed && result.isExceeded) {
      void reply.header('retry-after', result.ttlInSeconds);
      throw buildRateLimitError();
    }
  });
}

function buildRateLimitError(): ApiError {
  return new ApiError(429, 'rate_limited', english.api.errors.rateLimited);
}
