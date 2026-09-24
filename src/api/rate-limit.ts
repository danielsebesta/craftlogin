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

// A verification request is a rare, developer-initiated write with the same abuse
// profile as registering an application, but its own bucket so the two do not
// consume each other's budget.
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

// Confidential-client authentication costs an Argon2 verification per request.
// A shared ceiling bounds worst-case CPU when many addresses abuse the token
// and introspection endpoints at once. It runs through server.createRateLimit()
// because a second rateLimit() hook would be skipped after the first one runs;
// the constant key makes the bucket global rather than per address.
export const tokenEndpointGlobalRateLimit = {
  groupId: 'oauth-grant-global',
  keyGenerator: (): string => 'oauth-grant-global',
  max: 600,
  timeWindow: 60 * 1_000,
};

// Each authorize call creates an interaction record in Redis, so the endpoint
// gets its own volumetric bucket. The keyGenerator prefix keeps it separate
// from the other manual limiters, which share one store prefix.
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

// The status check needs an unguessable interaction id plus the signed session
// cookie, so guessing is infeasible and this limit is volumetric protection.
// It must tolerate several polling tabs and reload bursts behind one shared IP.
export const verificationStatusRateLimit = {
  groupId: 'verification-status',
  max: 120,
  timeWindow: 60 * 1_000,
};

// This has the same trust assumptions and budget as status polling, but an
// independent bucket keeps background polls from blocking a provider callback.
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
