import rateLimit from '@fastify/rate-limit';
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
  max: 30,
  timeWindow: 60 * 1_000,
};

// Confidential auth costs an Argon2 verify per request; this shared ceiling
// bounds worst-case CPU. Runs via createRateLimit() — a second rateLimit()
// hook would be skipped — and the constant key makes the bucket global.
export const tokenEndpointGlobalRateLimit = {
  groupId: 'oauth-grant-global',
  keyGenerator: (): string => 'oauth-grant-global',
  max: 600,
  timeWindow: 60 * 1_000,
};

// Each authorize call creates an interaction record in Redis; the keyGenerator
// prefix keeps this bucket separate from limiters sharing one store prefix.
export const authorizeRateLimit = {
  groupId: 'oauth-authorize',
  keyGenerator: (request: FastifyRequest): string => `authorize:${request.ip}`,
  max: 120,
  timeWindow: 60 * 1_000,
};

// The interaction page render hits Postgres (client + owner) on every load.
export const interactionPageRateLimit = {
  groupId: 'interaction-page',
  max: 120,
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

// An independent bucket keeps an icon refresh loop off the registration budget.
export const appIconWriteRateLimit = {
  groupId: 'app-icon-write',
  max: 20,
  timeWindow: 60 * 60 * 1_000,
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
}

function buildRateLimitError(): ApiError {
  return new ApiError(429, 'rate_limited', english.api.errors.rateLimited);
}
