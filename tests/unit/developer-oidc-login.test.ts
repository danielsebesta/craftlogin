import { describe, expect, it } from 'vitest';

import {
  consoleAuthorizeUrl,
  consoleStatesEqual,
  createConsoleOidcTransaction,
  exchangeConsoleCode,
  fetchConsoleSubject,
  ConsoleOidcError,
  type ConsoleOidcEndpoints,
} from '../../src/api/developer-oidc-login.js';

const endpoints: ConsoleOidcEndpoints = {
  authorizationEndpoint: 'https://craftlogin.com/oauth2/authorize',
  clientId: 'cl_console-test',
  redirectUri: 'https://craftlogin.com/developers/callback',
  tokenEndpoint: 'http://127.0.0.1:3000/oauth2/token',
  userInfoEndpoint: 'http://127.0.0.1:3000/oauth2/userinfo',
};

function stubFetch(handler: (url: string) => Response): typeof fetch {
  return (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(handler(url));
  };
}

describe('Developer Console OIDC client', (): void => {
  it('builds a standard authorization URL with S256 PKCE', (): void => {
    const transaction = createConsoleOidcTransaction();
    const url = new URL(consoleAuthorizeUrl(endpoints, transaction.state, transaction.challenge));

    expect(url.origin + url.pathname).toBe('https://craftlogin.com/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('cl_console-test');
    expect(url.searchParams.get('redirect_uri')).toBe('https://craftlogin.com/developers/callback');
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('state')).toBe(transaction.state);
    expect(url.searchParams.get('code_challenge')).toBe(transaction.challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('compares callback states in constant time', (): void => {
    expect(consoleStatesEqual('correct-state', 'correct-state')).toBe(true);
    expect(consoleStatesEqual('correct-state', 'wrong-state!')).toBe(false);
    expect(consoleStatesEqual('short', 'much-longer-state')).toBe(false);
  });

  it('exchanges the code and reads the subject', async (): Promise<void> => {
    const calls: string[] = [];
    const fetchImplementation = stubFetch((url) => {
      calls.push(url);
      if (url.endsWith('/oauth2/token')) {
        return Response.json({ access_token: 'console-token', token_type: 'Bearer' });
      }
      return Response.json({ sub: '123e4567-e89b-42d3-a456-426614174000' });
    });
    const scoped = { ...endpoints, fetchImplementation };

    await expect(exchangeConsoleCode(scoped, 'code', 'verifier')).resolves.toBe('console-token');
    await expect(fetchConsoleSubject(scoped, 'console-token')).resolves.toBe(
      '123e4567-e89b-42d3-a456-426614174000',
    );
    expect(calls).toEqual([scoped.tokenEndpoint, scoped.userInfoEndpoint]);
  });

  it('rejects failed token and userinfo responses without details', async (): Promise<void> => {
    const failing = {
      ...endpoints,
      fetchImplementation: stubFetch(() => new Response('no', { status: 500 })),
    };
    await expect(exchangeConsoleCode(failing, 'code', 'verifier')).rejects.toBeInstanceOf(
      ConsoleOidcError,
    );
    await expect(fetchConsoleSubject(failing, 'token')).rejects.toBeInstanceOf(ConsoleOidcError);

    const malformed = {
      ...endpoints,
      fetchImplementation: stubFetch(() => Response.json({ unexpected: true })),
    };
    await expect(exchangeConsoleCode(malformed, 'code', 'verifier')).rejects.toBeInstanceOf(
      ConsoleOidcError,
    );
    await expect(fetchConsoleSubject(malformed, 'token')).rejects.toBeInstanceOf(ConsoleOidcError);
  });
});
