import type { IncomingMessage, ServerResponse } from 'node:http';

import type Provider from 'oidc-provider';
import { z } from 'zod';

import type { AuthenticatedMinecraftPlayer } from '../verification/types.js';
import { MINECRAFT_ONLINE_MODE_ACR } from './constants.js';

const interactionContextSchema = z.object({
  clientId: z.string().min(1).max(64),
  interactionId: z.string().min(1).max(512),
  promptName: z.string(),
  scope: z.string().min(1),
});

export interface OAuthInteractionContext {
  readonly clientId: string;
  readonly interactionId: string;
  readonly promptName: string;
  readonly scope: string;
}

export interface OAuthInteractionGateway {
  abort(request: IncomingMessage, response: ServerResponse): Promise<string>;
  inspect(request: IncomingMessage, response: ServerResponse): Promise<OAuthInteractionContext>;
  persistVerifiedResult(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId: string,
    player: AuthenticatedMinecraftPlayer,
    resolvedAt: string,
  ): Promise<string>;
}

export class ProviderInteractionGateway implements OAuthInteractionGateway {
  public constructor(private readonly provider: Provider) {}

  public async abort(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<string> {
    // A denied request is finished through oidc-provider itself so the client
    // receives a standard access_denied error redirect. No grant is created.
    return await this.provider.interactionResult(request, response, {
      error: 'access_denied',
      error_description: 'The user denied the authorization request.',
    });
  }

  public async inspect(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<OAuthInteractionContext> {
    const interaction = await this.provider.interactionDetails(request, response);
    return interactionContextSchema.parse({
      clientId: interaction.params['client_id'],
      interactionId: interaction.uid,
      promptName: interaction.prompt.name,
      scope: interaction.params['scope'],
    });
  }

  public async persistVerifiedResult(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId: string,
    player: AuthenticatedMinecraftPlayer,
    resolvedAt: string,
  ): Promise<string> {
    const interaction = await this.provider.interactionDetails(request, response);
    const context = interactionContextSchema.parse({
      clientId: interaction.params['client_id'],
      interactionId: interaction.uid,
      promptName: interaction.prompt.name,
      scope: interaction.params['scope'],
    });
    if (context.interactionId !== expectedInteractionId || context.promptName !== 'login') {
      throw new OAuthInteractionStateError('The OIDC interaction changed before completion');
    }

    const grant = new this.provider.Grant({
      accountId: player.uuid,
      clientId: context.clientId,
    });
    grant.addOIDCScope(context.scope);

    try {
      const grantId = await grant.save();
      return await this.provider.interactionResult(
        request,
        response,
        {
          consent: { grantId },
          login: {
            accountId: player.uuid,
            acr: MINECRAFT_ONLINE_MODE_ACR,
            amr: ['minecraft_online_mode'],
            ts: toEpochSeconds(resolvedAt),
          },
        },
        { mergeWithLastSubmission: false },
      );
    } catch (error: unknown) {
      try {
        await grant.destroy();
      } catch (cleanupError: unknown) {
        throw new OAuthInteractionStateError('The OIDC interaction and grant cleanup both failed', {
          cause: new AggregateError([error, cleanupError]),
        });
      }
      throw new OAuthInteractionStateError('The OIDC interaction could not be persisted', {
        cause: error,
      });
    }
  }
}

export class OAuthInteractionStateError extends Error {
  public override readonly name = 'OAuthInteractionStateError';
}

function toEpochSeconds(timestamp: string): number {
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) {
    throw new OAuthInteractionStateError('The verification timestamp is invalid');
  }
  return Math.floor(milliseconds / 1_000);
}
