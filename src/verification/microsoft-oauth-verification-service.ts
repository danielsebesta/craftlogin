import type {
  HttpMicrosoftOAuthClient,
  MicrosoftMinecraftIdentity,
} from './microsoft-oauth-client.js';
import type { InteractionVerifiedIdentity } from './types.js';

export interface MicrosoftInteractionResolver {
  resolveInteraction(
    interactionId: string,
    identity: InteractionVerifiedIdentity,
    verifiedAt: Date,
  ): Promise<'resolved' | 'unavailable'>;
}

export class MicrosoftVerificationResolutionError extends Error {
  public override readonly name = 'MicrosoftVerificationResolutionError';
}

export class MicrosoftOAuthVerificationService {
  public constructor(
    private readonly client: Pick<
      HttpMicrosoftOAuthClient,
      'createAuthorizationUrl' | 'verifyAuthorizationCode'
    >,
    private readonly resolver: MicrosoftInteractionResolver,
  ) {}

  public createAuthorizationUrl(state: string, codeChallenge: string): string {
    return this.client.createAuthorizationUrl(state, codeChallenge);
  }

  public async verify(
    interactionId: string,
    authorizationCode: string,
    codeVerifier: string,
  ): Promise<MicrosoftMinecraftIdentity> {
    const identity = await this.client.verifyAuthorizationCode(authorizationCode, codeVerifier);
    const result = await this.resolver.resolveInteraction(
      interactionId,
      {
        ...identity.player,
        verifiedVia: 'microsoft-oauth',
      },
      new Date(),
    );
    if (result !== 'resolved') {
      throw new MicrosoftVerificationResolutionError(
        'The Microsoft verification interaction is no longer available',
      );
    }
    return identity;
  }
}
