import type { IncomingMessage, ServerResponse } from 'node:http';

import type Provider from 'oidc-provider';
import { z } from 'zod';

import type { AuthenticatedMinecraftPlayer, VerificationMethod } from '../verification/types.js';
import {
  MICROSOFT_OAUTH_ACR,
  MINECRAFT_ONLINE_MODE_ACR,
  MINECRAFT_PROFILE_SKIN_ACR,
} from './constants.js';

const interactionContextSchema = z.object({
  clientId: z.string().min(1).max(64),
  interactionId: z.string().min(1).max(512),
  promptName: z.string(),
  scope: z.string().min(1),
  promptDetails: z
    .object({
      missingOIDCScope: z.array(z.string()).optional(),
      missingOIDCClaims: z.array(z.string()).optional(),
      missingResourceScopes: z.record(z.string(), z.array(z.string())).optional(),
    })
    .loose(),
  sessionAccountId: z.string().min(1).optional(),
  grantId: z.string().min(1).optional(),
  acrValues: z.string().optional(),
});

export interface OAuthConsentDetails {
  readonly missingOIDCScope?: readonly string[] | undefined;
  readonly missingOIDCClaims?: readonly string[] | undefined;
  readonly missingResourceScopes?: Readonly<Record<string, readonly string[]>> | undefined;
}

export interface OAuthInteractionContext {
  readonly clientId: string;
  readonly interactionId: string;
  readonly promptName: string;
  readonly scope: string;
  readonly promptDetails: OAuthConsentDetails;
  readonly sessionAccountId?: string | undefined;
  readonly grantId?: string | undefined;
  readonly acrValues?: string | undefined;
}

export interface OAuthInteractionGateway {
  abort(request: IncomingMessage, response: ServerResponse): Promise<string>;
  switchAccount?(request: IncomingMessage, response: ServerResponse): Promise<string>;
  inspect(request: IncomingMessage, response: ServerResponse): Promise<OAuthInteractionContext>;
  persistConsent?(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId: string,
  ): Promise<string>;
  persistVerifiedResult(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId: string,
    player: AuthenticatedMinecraftPlayer,
    resolvedAt: string,
    method: VerificationMethod,
  ): Promise<string>;
}

export class ProviderInteractionGateway implements OAuthInteractionGateway {
  public constructor(private readonly provider: Provider) {}

  public async abort(request: IncomingMessage, response: ServerResponse): Promise<string> {
    // A denied request is finished through oidc-provider itself so the client
    // receives a standard access_denied error redirect. No grant is created.
    return await this.provider.interactionResult(request, response, {
      error: 'access_denied',
      error_description: 'The user denied the authorization request.',
    });
  }

  public async switchAccount(request: IncomingMessage, response: ServerResponse): Promise<string> {
    const interaction = await this.provider.interactionDetails(request, response);
    if (interaction.session?.uid !== undefined) {
      const session = await this.provider.Session.findByUid(interaction.session.uid);
      if (session !== undefined) {
        await session.destroy();
      }
    }
    const authorizationUrl = new URL(`${this.provider.issuer}/oauth2/authorize`);
    const params = z
      .record(z.string(), z.union([z.string(), z.array(z.string())]))
      .parse(interaction.params);
    for (const [name, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const item of value) authorizationUrl.searchParams.append(name, item);
      } else {
        authorizationUrl.searchParams.set(name, value);
      }
    }
    return authorizationUrl.toString();
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
      promptDetails: interaction.prompt.details,
      acrValues: interaction.params['acr_values'],
      ...(interaction.session === undefined
        ? {}
        : { sessionAccountId: interaction.session.accountId }),
      ...(interaction.grantId === undefined ? {} : { grantId: interaction.grantId }),
    });
  }

  public async persistConsent(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId: string,
  ): Promise<string> {
    const interaction = await this.provider.interactionDetails(request, response);
    const context = interactionContextSchema.parse({
      clientId: interaction.params['client_id'],
      interactionId: interaction.uid,
      promptName: interaction.prompt.name,
      scope: interaction.params['scope'],
      promptDetails: interaction.prompt.details,
      acrValues: interaction.params['acr_values'],
      ...(interaction.session === undefined
        ? {}
        : { sessionAccountId: interaction.session.accountId }),
      ...(interaction.grantId === undefined ? {} : { grantId: interaction.grantId }),
    });
    if (
      context.interactionId !== expectedInteractionId ||
      context.promptName !== 'consent' ||
      context.sessionAccountId === undefined
    ) {
      throw new OAuthInteractionStateError(
        'The OIDC consent interaction changed before completion',
      );
    }

    const grant =
      context.grantId === undefined
        ? new this.provider.Grant({
            accountId: context.sessionAccountId,
            clientId: context.clientId,
          })
        : await this.provider.Grant.find(context.grantId);
    if (grant === undefined) {
      throw new OAuthInteractionStateError('The OIDC consent grant is no longer available');
    }
    const details = context.promptDetails;
    if (details.missingOIDCScope !== undefined) grant.addOIDCScope(details.missingOIDCScope);
    if (details.missingOIDCClaims !== undefined) grant.addOIDCClaims(details.missingOIDCClaims);
    if (details.missingResourceScopes !== undefined) {
      for (const [resource, scopes] of Object.entries(details.missingResourceScopes)) {
        grant.addResourceScope(resource, scopes);
      }
    }
    try {
      const grantId = await grant.save();
      return await this.provider.interactionResult(
        request,
        response,
        { consent: { grantId } },
        { mergeWithLastSubmission: true },
      );
    } catch (error: unknown) {
      if (context.grantId === undefined) {
        try {
          await grant.destroy();
        } catch (cleanupError: unknown) {
          throw new OAuthInteractionStateError('The OIDC consent grant cleanup failed', {
            cause: new AggregateError([error, cleanupError]),
          });
        }
      }
      throw new OAuthInteractionStateError('The OIDC consent could not be persisted', {
        cause: error,
      });
    }
  }

  public async persistVerifiedResult(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId: string,
    player: AuthenticatedMinecraftPlayer,
    resolvedAt: string,
    method: VerificationMethod,
  ): Promise<string> {
    const interaction = await this.provider.interactionDetails(request, response);
    const context = interactionContextSchema.parse({
      clientId: interaction.params['client_id'],
      interactionId: interaction.uid,
      promptName: interaction.prompt.name,
      scope: interaction.params['scope'],
      promptDetails: interaction.prompt.details,
      acrValues: interaction.params['acr_values'],
      ...(interaction.session === undefined
        ? {}
        : { sessionAccountId: interaction.session.accountId }),
      ...(interaction.grantId === undefined ? {} : { grantId: interaction.grantId }),
    });
    if (context.interactionId !== expectedInteractionId || context.promptName !== 'login') {
      throw new OAuthInteractionStateError('The OIDC interaction changed before completion');
    }
    const acr = authenticationContextForMethod(method);
    if (context.acrValues !== undefined && !context.acrValues.split(/\s+/u).includes(acr)) {
      throw new OAuthInteractionStateError(
        'The completed authentication method does not satisfy the authorization request',
      );
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
            acr,
            amr: [method],
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

function authenticationContextForMethod(method: VerificationMethod): string {
  switch (method) {
    case 'minecraft_online_mode':
      return MINECRAFT_ONLINE_MODE_ACR;
    case 'minecraft_profile_skin':
      return MINECRAFT_PROFILE_SKIN_ACR;
    case 'microsoft_oauth':
      return MICROSOFT_OAUTH_ACR;
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
