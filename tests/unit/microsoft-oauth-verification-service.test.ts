import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { MicrosoftOAuthVerificationService } from '../../src/verification/microsoft-oauth-verification-service.js';
import type {
  AuthenticatedMinecraftPlayer,
  InteractionVerifiedIdentity,
} from '../../src/verification/types.js';

const player: AuthenticatedMinecraftPlayer = {
  username: 'VerifiedPlayer',
  uuid: '123e4567-e89b-42d3-a456-426614174000',
};

describe('MicrosoftOAuthVerificationService', (): void => {
  it('keeps token handling behind the identity-only client boundary', async (): Promise<void> => {
    const resolutions: {
      readonly identity: InteractionVerifiedIdentity;
      readonly interactionId: string;
    }[] = [];
    const service = new MicrosoftOAuthVerificationService(
      {
        createAuthorizationUrl: (): string => 'https://login.microsoftonline.com/authorize',
        verifyAuthorizationCode: (
          authorizationCode,
          codeVerifier,
        ): Promise<{
          readonly edition: 'java';
          readonly player: AuthenticatedMinecraftPlayer;
        }> => {
          expect(authorizationCode).toBe('microsoft-authorization-code');
          expect(codeVerifier).toBe('pkce-code-verifier');
          return Promise.resolve({ edition: 'java', player });
        },
      },
      {
        resolveInteraction: (interactionId, identity): Promise<'resolved'> => {
          resolutions.push({ identity, interactionId });
          return Promise.resolve('resolved');
        },
      },
    );

    await expect(
      service.verify('interaction-id', 'microsoft-authorization-code', 'pkce-code-verifier'),
    ).resolves.toEqual({ edition: 'java', player });
    expect(resolutions).toEqual([
      {
        identity: { ...player, verifiedVia: 'microsoft-oauth' },
        interactionId: 'interaction-id',
      },
    ]);
    expect(JSON.stringify(resolutions)).not.toMatch(/token|authorization-code|code-verifier/iu);
  });

  it('keeps token-bearing modules free of storage dependencies', async (): Promise<void> => {
    const sources = await Promise.all(
      ['microsoft-oauth-client.ts', 'microsoft-oauth-verification-service.ts'].map(
        async (filename): Promise<string> =>
          await readFile(new URL(`../../src/verification/${filename}`, import.meta.url), 'utf8'),
      ),
    );
    expect(sources.join('\n')).not.toMatch(/(?:redis|prisma|repository|cache)/iu);
  });
});
