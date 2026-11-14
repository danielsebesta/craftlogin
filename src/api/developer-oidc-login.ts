import { readBoundedResponseBody } from '../mojang/bounded-body.js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { MICROSOFT_OAUTH_ACR, MINECRAFT_ONLINE_MODE_ACR } from '../oauth/constants.js';
import type { VerificationMethod } from '../verification/types.js';

// The console can rewrite any client's redirect URIs, so it accepts only methods
// that reach the player directly. A skin marker can be planted through phishing.
const CONSOLE_ACR_VALUES = `${MINECRAFT_ONLINE_MODE_ACR} ${MICROSOFT_OAUTH_ACR}`;
const CONSOLE_AUTHENTICATION_METHODS: ReadonlySet<string> = new Set<VerificationMethod>([
  'microsoft_oauth',
  'minecraft_online_mode',
]);

export interface ConsoleOidcEndpoints {
  readonly authorizationEndpoint: string;
  readonly clientId: string;
  readonly fetchImplementation?: typeof fetch;
  readonly redirectUri: string;
  readonly tokenEndpoint: string;
  readonly userInfoEndpoint: string;
}

export interface ConsoleOidcTransaction {
  readonly challenge: string;
  readonly state: string;
  readonly verifier: string;
}

export interface ConsoleTokens {
  readonly accessToken: string;
  readonly idToken: string;
}

export class ConsoleOidcError extends Error {
  public override readonly name = 'ConsoleOidcError';
}

const tokenResponseSchema = z
  .object({ access_token: z.string().min(1), id_token: z.string().min(1) })
  .catchall(z.unknown());
const idTokenClaimsSchema = z
  .object({ amr: z.array(z.string()).optional(), sub: z.string().min(1) })
  .catchall(z.unknown());
const userInfoResponseSchema = z.object({ sub: z.string().min(1) }).catchall(z.unknown());

export function createConsoleOidcTransaction(): ConsoleOidcTransaction {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier, 'utf8').digest('base64url');
  return { challenge, state: randomBytes(32).toString('base64url'), verifier };
}

export function consoleAuthorizeUrl(
  endpoints: ConsoleOidcEndpoints,
  state: string,
  challenge: string,
): string {
  const url = new URL(endpoints.authorizationEndpoint);
  url.searchParams.set('acr_values', CONSOLE_ACR_VALUES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', endpoints.clientId);
  url.searchParams.set('redirect_uri', endpoints.redirectUri);
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function consoleStatesEqual(expected: string, candidate: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const candidateBytes = Buffer.from(candidate, 'utf8');
  return (
    expectedBytes.length === candidateBytes.length && timingSafeEqual(expectedBytes, candidateBytes)
  );
}

export async function exchangeConsoleCode(
  endpoints: ConsoleOidcEndpoints,
  code: string,
  verifier: string,
): Promise<ConsoleTokens> {
  const fetchImplementation = endpoints.fetchImplementation ?? fetch;
  let response: Response;
  try {
    response = await fetchImplementation(endpoints.tokenEndpoint, {
      body: new URLSearchParams({
        client_id: endpoints.clientId,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: endpoints.redirectUri,
      }).toString(),
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error: unknown) {
    throw new ConsoleOidcError('Console token exchange failed', { cause: error });
  }
  if (!response.ok) {
    throw new ConsoleOidcError(
      `Console token exchange returned HTTP ${response.status.toString()}`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(
      (await readBoundedResponseBody(response, 256 * 1024, 'OAuth response')).toString('utf8'),
    );
  } catch (error: unknown) {
    throw new ConsoleOidcError('Console token exchange returned invalid JSON', { cause: error });
  }
  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ConsoleOidcError('Console token exchange returned an unexpected payload');
  }
  return { accessToken: parsed.data.access_token, idToken: parsed.data.id_token };
}

/**
 * The browser carries acr_values and can drop them, so the method that was really
 * used is checked here. The ID token came straight from the token endpoint, which
 * OIDC Core 3.1.3.7 accepts in place of checking its signature.
 */
export function assertConsoleAuthentication(idToken: string, subject: string): void {
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch (error: unknown) {
    throw new ConsoleOidcError('Console ID token is not readable', { cause: error });
  }
  const parsed = idTokenClaimsSchema.safeParse(claims);
  if (
    !parsed.success ||
    parsed.data.sub !== subject ||
    parsed.data.amr?.some((method): boolean => CONSOLE_AUTHENTICATION_METHODS.has(method)) !== true
  ) {
    throw new ConsoleOidcError('Console sign-in used a method the console does not accept');
  }
}

export async function fetchConsoleSubject(
  endpoints: ConsoleOidcEndpoints,
  accessToken: string,
): Promise<string> {
  const fetchImplementation = endpoints.fetchImplementation ?? fetch;
  let response: Response;
  try {
    response = await fetchImplementation(endpoints.userInfoEndpoint, {
      headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error: unknown) {
    throw new ConsoleOidcError('Console userinfo request failed', { cause: error });
  }
  if (!response.ok) {
    throw new ConsoleOidcError(
      `Console userinfo request returned HTTP ${response.status.toString()}`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(
      (await readBoundedResponseBody(response, 256 * 1024, 'OAuth response')).toString('utf8'),
    );
  } catch (error: unknown) {
    throw new ConsoleOidcError('Console userinfo returned invalid JSON', { cause: error });
  }
  const parsed = userInfoResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ConsoleOidcError('Console userinfo returned an unexpected payload');
  }
  return parsed.data.sub;
}
