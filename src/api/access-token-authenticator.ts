import type Provider from 'oidc-provider';

import { english } from '../locales/en.js';
import { ApiError } from './errors.js';

const BEARER_PATTERN = /^Bearer ([^\s]+)$/iu;

export interface AuthenticatedAccessToken {
  readonly accountId: string;
  readonly clientId: string;
}

export interface AccessTokenAuthenticator {
  authenticate(authorizationHeader: string | undefined): Promise<AuthenticatedAccessToken>;
}

export class ProviderAccessTokenAuthenticator implements AccessTokenAuthenticator {
  public constructor(private readonly provider: Provider) {}

  public async authenticate(
    authorizationHeader: string | undefined,
  ): Promise<AuthenticatedAccessToken> {
    const match = authorizationHeader?.match(BEARER_PATTERN);
    const serializedToken = match?.[1];
    if (serializedToken === undefined) {
      throw unauthorized();
    }

    const token = await this.provider.AccessToken.find(serializedToken);
    if (
      token === undefined ||
      !token.isValid ||
      typeof token.accountId !== 'string' ||
      typeof token.clientId !== 'string'
    ) {
      throw unauthorized();
    }
    if (!token.scopes.has('openid') || !token.scopes.has('profile')) {
      throw new ApiError(403, 'insufficient_scope', english.api.errors.insufficientScope);
    }

    return { accountId: token.accountId, clientId: token.clientId };
  }
}

function unauthorized(): ApiError {
  return new ApiError(401, 'unauthorized', english.api.errors.unauthorized);
}
