import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

import { english } from '../locales/en.js';
import { ApiError } from './errors.js';

export const appRegistrationRateLimit = {
  groupId: 'app-registration',
  max: 5,
  timeWindow: 60 * 60 * 1_000,
};

export const tokenRateLimit = {
  groupId: 'oauth-token',
  max: 30,
  timeWindow: 60 * 1_000,
};

export const developerLoginPageRateLimit = {
  groupId: 'developer-login-page',
  max: 120,
  timeWindow: 60 * 1_000,
};

export const developerLoginCreationRateLimit = {
  max: 10,
  timeWindow: 60 * 60 * 1_000,
};

// The status check needs an unguessable interaction id plus the signed session
// cookie, so guessing is infeasible and this limit is volumetric protection.
// It must tolerate several polling tabs and reload bursts behind one shared IP.
export const verificationStatusRateLimit = {
  groupId: 'verification-status',
  max: 120,
  timeWindow: 60 * 1_000,
};

export const skinVerificationStartRateLimit = {
  groupId: 'skin-verification-start',
  max: 10,
  timeWindow: 60 * 60 * 1_000,
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
