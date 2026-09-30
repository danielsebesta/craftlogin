import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import type { AdapterPayload } from 'oidc-provider';
import { z } from 'zod';

import { getErrorKind } from '../logging/error-kind.js';

// oidc-provider persists the session jti (adapter record id) in a signed
// `__Host-` cookie; the keygrip signature lives in the sibling `<name>.sig`
// cookie. Session.get resolves the cookie through adapter.find(), so the
// account page must do the same — findByUid would look the uid index up by a
// value that is never stored there.
export const OIDC_SESSION_COOKIE = '__Host-craftlogin_session';
export const OIDC_SESSION_SIGNATURE_COOKIE = `${OIDC_SESSION_COOKIE}.sig`;
// Mirror of `cookies.names` in src/oauth/provider.ts: deleting the account
// drops every provider cookie, including any mid-flow interaction artifacts.
export const OIDC_INTERACTION_COOKIE = '__Secure-craftlogin_interaction';
export const OIDC_INTERACTION_SIGNATURE_COOKIE = `${OIDC_INTERACTION_COOKIE}.sig`;
export const OIDC_RESUME_COOKIE = '__Secure-craftlogin_resume';
export const OIDC_RESUME_SIGNATURE_COOKIE = `${OIDC_RESUME_COOKIE}.sig`;

const sessionPayloadSchema = z.looseObject({
  accountId: z.uuid(),
  iat: z.number().int().positive(),
});

export interface AccountSession {
  readonly accountId: string;
  readonly issuedAtSeconds: number;
  readonly jti: string;
}

export interface OidcSessionIndex {
  destroy(jti: string): Promise<void>;
  find(jti: string): Promise<AdapterPayload | undefined>;
}

/**
 * The signature format koa/cookies (keygrip) stores in `<name>.sig`:
 * base64url(HMAC-SHA1(key, "<name>=<value>")) without padding — keygrip's
 * default algorithm is sha1 and the signed data is the whole `name=value`
 * pair. Every configured key is tried so cookie-key rotation keeps existing
 * sessions valid.
 */
export function signSessionCookieValue(value: string, key: string): string {
  return createHmac('sha1', key)
    .update(`${OIDC_SESSION_COOKIE}=${value}`, 'utf8')
    .digest('base64')
    .replaceAll('/', '_')
    .replaceAll('+', '-')
    .replace(/=+$/u, '');
}

export function verifiedSessionId(
  request: Pick<FastifyRequest, 'cookies'>,
  cookieKeys: readonly string[],
): string | undefined {
  const value = request.cookies[OIDC_SESSION_COOKIE];
  const signature = request.cookies[OIDC_SESSION_SIGNATURE_COOKIE];
  if (value === undefined || signature === undefined) {
    return undefined;
  }
  const candidate = Buffer.from(signature, 'utf8');
  for (const key of cookieKeys) {
    const expected = Buffer.from(signSessionCookieValue(value, key), 'utf8');
    if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) {
      return value;
    }
  }
  return undefined;
}

// A missing, malformed, expired, or corrupt session reads as signed out rather
// than erroring the account page.
export async function readAccountSession(
  request: Pick<FastifyRequest, 'cookies'>,
  cookieKeys: readonly string[],
  sessions: OidcSessionIndex,
  logger: Pick<FastifyBaseLogger, 'warn'>,
): Promise<AccountSession | undefined> {
  const jti = verifiedSessionId(request, cookieKeys);
  if (jti === undefined) {
    if (
      request.cookies[OIDC_SESSION_COOKIE] !== undefined ||
      request.cookies[OIDC_SESSION_SIGNATURE_COOKIE] !== undefined
    ) {
      logger.warn(
        {
          hasCookie: request.cookies[OIDC_SESSION_COOKIE] !== undefined,
          hasSignature: request.cookies[OIDC_SESSION_SIGNATURE_COOKIE] !== undefined,
        },
        'OIDC session cookie signature rejected',
      );
    }
    return undefined;
  }
  let payload: AdapterPayload | undefined;
  try {
    payload = await sessions.find(jti);
  } catch (error: unknown) {
    logger.warn({ errorKind: getErrorKind(error) }, 'OIDC session record could not be read');
    return undefined;
  }
  if (payload === undefined) {
    logger.warn(
      {
        // Hash prefix of the session id for correlation without logging the
        // identifier itself (same pattern as session-signal references).
        jtiFingerprint: createHash('sha256').update(jti, 'utf8').digest('hex').slice(0, 16),
      },
      'OIDC session record not found for presented id',
    );
    return undefined;
  }
  const parsed = sessionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues.length }, 'OIDC session payload shape rejected');
    return undefined;
  }
  return {
    accountId: parsed.data.accountId,
    issuedAtSeconds: parsed.data.iat,
    jti,
  };
}

const REVOKE_TOKEN_PURPOSE = 'account-revoke';
const DELETE_TOKEN_PURPOSE = 'account-delete';

/**
 * Stateless form token bound to the session uid and the client, so a revoke
 * POST is accepted only from a form this exact session was served.
 */
export function accountRevokeToken(key: string, sessionUid: string, clientId: string): string {
  return createHmac('sha256', key)
    .update(`${REVOKE_TOKEN_PURPOSE}:${sessionUid}:${clientId}`, 'utf8')
    .digest('hex');
}

// The delete-account token lives under a separate purpose label so a service
// revoke token can never be replayed against identity deletion.
export function accountDeleteToken(key: string, sessionJti: string): string {
  return createHmac('sha256', key)
    .update(`${DELETE_TOKEN_PURPOSE}:${sessionJti}`, 'utf8')
    .digest('hex');
}

export function revokeTokenMatches(expected: string, candidate: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const candidateBytes = Buffer.from(candidate, 'utf8');
  return (
    expectedBytes.length === candidateBytes.length && timingSafeEqual(expectedBytes, candidateBytes)
  );
}
