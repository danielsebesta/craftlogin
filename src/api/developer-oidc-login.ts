import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

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

export class ConsoleOidcError extends Error {
  public override readonly name = 'ConsoleOidcError';
}

const tokenResponseSchema = z.object({ access_token: z.string().min(1) }).catchall(z.unknown());
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
): Promise<string> {
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
    payload = await response.json();
  } catch (error: unknown) {
    throw new ConsoleOidcError('Console token exchange returned invalid JSON', { cause: error });
  }
  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ConsoleOidcError('Console token exchange returned an unexpected payload');
  }
  return parsed.data.access_token;
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
    payload = await response.json();
  } catch (error: unknown) {
    throw new ConsoleOidcError('Console userinfo returned invalid JSON', { cause: error });
  }
  const parsed = userInfoResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ConsoleOidcError('Console userinfo returned an unexpected payload');
  }
  return parsed.data.sub;
}
