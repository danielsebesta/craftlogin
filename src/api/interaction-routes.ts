import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance, FastifyReply } from 'fastify';

import { english } from '../locales/en.js';
import type { MinecraftPlayerLookup } from '../mojang/client.js';
import type {
  OAuthInteractionAbortion,
  OAuthInteractionCompletion,
  PendingOAuthInteraction,
} from '../oauth/interaction-service.js';
import { OAuthInteractionStateError } from '../oauth/interaction-gateway.js';
import { VerificationStateError } from '../verification/redis-verification-store.js';
import { renderInteractionErrorPage, type InteractionErrorKind } from './interaction-error-page.js';
import type { VerificationStatus } from '../verification/types.js';
import type { SkinVerificationChallenge } from '../verification/redis-skin-verification-store.js';
import {
  SkinVerificationPlayerNotFoundError,
  SkinVerificationResolutionError,
} from '../verification/skin-verification-service.js';
import { renderAutoForwardPage } from './auto-forward-page.js';
import { ApiError } from './errors.js';
import { interactionScript, interactionStyles } from './interaction-assets.js';
import { renderInteractionPage, type InteractionOwner } from './interaction-page.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';
import {
  skinVerificationLookupRateLimit,
  skinVerificationStartRateLimit,
  verificationStatusRateLimit,
} from './rate-limit.js';
import {
  interactionAbortRouteSchema,
  interactionAssetRouteSchema,
  interactionCompleteRouteSchema,
  interactionPageRouteSchema,
  interactionStatusRouteSchema,
  skinVerificationDownloadRouteSchema,
  skinVerificationLookupRouteSchema,
  skinVerificationStartRouteSchema,
  skinVerificationStatusRouteSchema,
} from './schemas.js';

interface InteractionParams {
  readonly uid: string;
}

interface SkinVerificationBody {
  readonly username: string;
}

interface SkinVerificationLookupQuery {
  readonly username: string;
}

export interface ApiInteractionService {
  abort(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionAbortion>;
  switchAccount?(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionAbortion>;
  start(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<PendingOAuthInteraction>;
  status(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<VerificationStatus>;
  complete(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionCompletion>;
  prepareMicrosoft?(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<{ readonly interactionId: string }>;
  checkSkin?(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<VerificationStatus>;
  lookupSkin?(
    request: IncomingMessage,
    response: ServerResponse,
    username: string,
    expectedInteractionId?: string,
  ): Promise<
    import('../verification/skin-verification-service.js').SkinVerificationLookup | undefined
  >;
  getSkinChallenge?(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<SkinVerificationChallenge | undefined>;
  startSkin?(
    request: IncomingMessage,
    response: ServerResponse,
    username: string,
    expectedInteractionId?: string,
  ): Promise<unknown>;
}

export interface ClientDirectoryEntry {
  readonly name: string;
  /** Manual verification label shown beside the app name on the consent screen. */
  readonly verified: boolean;
}

export interface ClientDirectoryLookup {
  findClient(clientId: string): Promise<ClientDirectoryEntry | undefined>;
  findClientOwnerUuid(clientId: string): Promise<string | undefined>;
}

export interface AccountNameLookup {
  findCurrentUser(uuid: string): Promise<{ readonly username: string } | undefined>;
}

export interface InteractionRoutesOptions {
  readonly accounts?: AccountNameLookup;
  readonly clients: ClientDirectoryLookup;
  readonly interactions: ApiInteractionService;
  readonly minecraftBaseDomain: string;
  readonly players?: MinecraftPlayerLookup;
}

export function registerInteractionRoutes(
  server: FastifyInstance,
  options: InteractionRoutesOptions,
): void {
  server.get<{ Params: InteractionParams }>(
    '/interaction/:uid',
    { schema: interactionPageRouteSchema },
    async (request, reply): Promise<void> => {
      let interaction: PendingOAuthInteraction;
      try {
        interaction = await options.interactions.start(request.raw, reply.raw, request.params.uid);
      } catch (error: unknown) {
        if (await sendInteractionErrorPage(reply, error)) {
          return;
        }
        throw error;
      }
      const client = await options.clients.findClient(interaction.clientId);
      const appName = client?.name ?? interaction.clientId;
      const ownerUuid = await options.clients.findClientOwnerUuid(interaction.clientId);
      const owner =
        ownerUuid === undefined ? undefined : await resolveOwner(options.players, ownerUuid);
      const account =
        interaction.accountId === undefined || options.accounts === undefined
          ? undefined
          : await options.accounts.findCurrentUser(interaction.accountId);

      setInteractionHeaders(reply);
      await reply.type('text/html; charset=utf-8').send(
        renderInteractionPage({
          appName,
          ...(client?.verified === true ? { appVerified: true } : {}),
          ...(interaction.code === undefined ? {} : { code: interaction.code }),
          interactionId: interaction.interactionId,
          minecraftBaseDomain: options.minecraftBaseDomain,
          kind: interaction.kind,
          ...(account === undefined ? {} : { accountName: account.username }),
          ...(interaction.accountId === undefined
            ? {}
            : {
                accountAvatarUrl: `/api/avatars/${encodeURIComponent(interaction.accountId)}/face?size=64&layers=all`,
              }),
          ...(owner === undefined ? {} : { owner }),
          scope: interaction.scope,
          ...(interaction.skinChallenge === undefined
            ? {}
            : { skinChallenge: interaction.skinChallenge }),
          ...(interaction.allowsSkinVerification === undefined
            ? {}
            : { allowsSkinVerification: interaction.allowsSkinVerification }),
          ...(interaction.allowsOnlineVerification === undefined
            ? {}
            : { allowsOnlineVerification: interaction.allowsOnlineVerification }),
          ...(interaction.allowsMicrosoftVerification === undefined
            ? {}
            : { allowsMicrosoftVerification: interaction.allowsMicrosoftVerification }),
        }),
      );
    },
  );

  server.get<{ Params: InteractionParams }>(
    '/interaction/:uid/status',
    {
      config: { rateLimit: verificationStatusRateLimit },
      schema: interactionStatusRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const verification = await options.interactions.status(
        request.raw,
        reply.raw,
        request.params.uid,
      );
      void reply.header('cache-control', 'no-store');
      await reply.send({ status: verification.status });
    },
  );

  server.post<{ Params: InteractionParams }>(
    '/interaction/:uid/abort',
    { schema: interactionAbortRouteSchema },
    async (request, reply): Promise<void> => {
      let abortion: OAuthInteractionAbortion;
      try {
        abortion = await options.interactions.abort(request.raw, reply.raw, request.params.uid);
      } catch (error: unknown) {
        if (isInteractionClientError(error)) {
          await reply.redirect(interactionPageUrl(request.params.uid), 303);
          return;
        }
        throw error;
      }
      setInteractionHeaders(reply);
      await reply.type('text/html; charset=utf-8').send(renderAutoForwardPage(abortion.redirectTo));
    },
  );

  server.post<{ Body: SkinVerificationBody; Params: InteractionParams }>(
    '/interaction/:uid/skin/start',
    {
      config: { rateLimit: skinVerificationStartRateLimit },
      schema: skinVerificationStartRouteSchema,
    },
    async (request, reply): Promise<void> => {
      if (options.interactions.startSkin === undefined) {
        throw new ApiError(501, 'internal_error', english.api.errors.internal);
      }
      try {
        await options.interactions.startSkin(
          request.raw,
          reply.raw,
          request.body.username,
          request.params.uid,
        );
      } catch (error: unknown) {
        if (isInteractionClientError(error)) {
          await reply.redirect(interactionPageUrl(request.params.uid), 303);
          return;
        }
        if (error instanceof SkinVerificationPlayerNotFoundError) {
          throw new ApiError(404, 'not_found', english.api.errors.minecraftPlayerNotFound, {
            cause: error,
          });
        }
        if (error instanceof SkinVerificationResolutionError) {
          throw new ApiError(
            503,
            'service_unavailable',
            english.api.errors.minecraftSkinUnavailable,
            { cause: error },
          );
        }
        throw error;
      }
      await reply.redirect(`/interaction/${encodeURIComponent(request.params.uid)}`, 303);
    },
  );

  server.get<{ Params: InteractionParams; Querystring: SkinVerificationLookupQuery }>(
    '/interaction/:uid/skin/lookup',
    {
      config: { rateLimit: skinVerificationLookupRateLimit },
      schema: skinVerificationLookupRouteSchema,
    },
    async (request, reply): Promise<void> => {
      if (options.interactions.lookupSkin === undefined) {
        throw new ApiError(501, 'internal_error', english.api.errors.internal);
      }
      try {
        const profile = await options.interactions.lookupSkin(
          request.raw,
          reply.raw,
          request.query.username,
          request.params.uid,
        );
        void reply.header('cache-control', 'no-store');
        await reply.send(
          profile === undefined
            ? { found: false }
            : {
                found: true,
                hasSkin: profile.hasSkin,
                model: profile.model,
                username: profile.username,
                uuid: profile.uuid,
              },
        );
      } catch (error: unknown) {
        if (error instanceof SkinVerificationResolutionError) {
          throw new ApiError(
            503,
            'service_unavailable',
            english.api.errors.minecraftSkinUnavailable,
            {
              cause: error,
            },
          );
        }
        throw error;
      }
    },
  );

  server.get<{ Params: InteractionParams }>(
    '/interaction/:uid/skin/download',
    { schema: skinVerificationDownloadRouteSchema },
    async (request, reply): Promise<void> => {
      if (options.interactions.getSkinChallenge === undefined) {
        throw new ApiError(501, 'internal_error', english.api.errors.internal);
      }
      const challenge = await options.interactions.getSkinChallenge(
        request.raw,
        reply.raw,
        request.params.uid,
      );
      if (challenge === undefined) {
        throw new ApiError(404, 'not_found', english.api.errors.notFound);
      }
      void reply.headers({
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="craftlogin-${challenge.username}.png"`,
        'x-content-type-options': 'nosniff',
      });
      await reply.type('image/png').send(challenge.body);
    },
  );

  server.get<{ Params: InteractionParams }>(
    '/interaction/:uid/skin/original-download',
    { schema: skinVerificationDownloadRouteSchema },
    async (request, reply): Promise<void> => {
      if (options.interactions.getSkinChallenge === undefined) {
        throw new ApiError(501, 'internal_error', english.api.errors.internal);
      }
      const challenge = await options.interactions.getSkinChallenge(
        request.raw,
        reply.raw,
        request.params.uid,
      );
      if (challenge?.originalBody === undefined) {
        throw new ApiError(404, 'not_found', english.api.errors.notFound);
      }
      void reply.headers({
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="craftlogin-${challenge.username}-original.png"`,
        'x-content-type-options': 'nosniff',
      });
      await reply.type('image/png').send(challenge.originalBody);
    },
  );

  server.get<{ Params: InteractionParams }>(
    '/interaction/:uid/skin/status',
    {
      config: { rateLimit: verificationStatusRateLimit },
      schema: skinVerificationStatusRouteSchema,
    },
    async (request, reply): Promise<void> => {
      if (options.interactions.checkSkin === undefined) {
        throw new ApiError(501, 'internal_error', english.api.errors.internal);
      }
      let verification: VerificationStatus;
      try {
        verification = await options.interactions.checkSkin(
          request.raw,
          reply.raw,
          request.params.uid,
        );
      } catch (error: unknown) {
        if (error instanceof SkinVerificationResolutionError) {
          throw new ApiError(
            503,
            'service_unavailable',
            english.api.errors.minecraftSkinUnavailable,
            { cause: error },
          );
        }
        throw error;
      }
      void reply.header('cache-control', 'no-store');
      await reply.send({ status: verification.status });
    },
  );

  server.post<{ Params: InteractionParams }>(
    '/interaction/:uid/complete',
    { schema: interactionCompleteRouteSchema },
    async (request, reply): Promise<void> => {
      let completion: OAuthInteractionCompletion;
      try {
        completion = await options.interactions.complete(
          request.raw,
          reply.raw,
          request.params.uid,
        );
      } catch (error: unknown) {
        if (isInteractionClientError(error)) {
          await reply.redirect(interactionPageUrl(request.params.uid), 303);
          return;
        }
        throw error;
      }
      if (completion.status === 'expired') {
        await reply.redirect(interactionPageUrl(request.params.uid), 303);
        return;
      }
      if (completion.status === 'complete') {
        setInteractionHeaders(reply);
        await reply
          .type('text/html; charset=utf-8')
          .send(renderAutoForwardPage(completion.redirectTo));
        return;
      }
      await reply.redirect(`/interaction/${encodeURIComponent(request.params.uid)}`, 303);
    },
  );

  server.post<{ Params: InteractionParams }>(
    '/interaction/:uid/switch',
    { schema: interactionAbortRouteSchema },
    async (request, reply): Promise<void> => {
      if (options.interactions.switchAccount === undefined) {
        throw new ApiError(501, 'internal_error', english.api.errors.internal);
      }
      let result: OAuthInteractionAbortion;
      try {
        result = await options.interactions.switchAccount(
          request.raw,
          reply.raw,
          request.params.uid,
        );
      } catch (error: unknown) {
        if (isInteractionClientError(error)) {
          await reply.redirect(interactionPageUrl(request.params.uid), 303);
          return;
        }
        throw error;
      }
      setInteractionHeaders(reply);
      await reply.type('text/html; charset=utf-8').send(renderAutoForwardPage(result.redirectTo));
    },
  );

  server.get(
    '/assets/interaction.css',
    { schema: interactionAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=0, must-revalidate');
      await reply.type('text/css; charset=utf-8').send(interactionStyles);
    },
  );

  server.get(
    '/assets/interaction.js',
    { schema: interactionAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=0, must-revalidate');
      await reply.type('text/javascript; charset=utf-8').send(interactionScript);
    },
  );
}

// The publisher identity is decorative trust information: a failed Mojang
// lookup degrades to a short UUID instead of failing the interaction page.
async function resolveOwner(
  players: MinecraftPlayerLookup | undefined,
  ownerUuid: string,
): Promise<InteractionOwner> {
  let name: string | undefined;
  try {
    name = (await players?.findProfileById(ownerUuid))?.username;
  } catch {
    name = undefined;
  }
  return {
    avatarUrl: `/api/avatars/${encodeURIComponent(ownerUuid)}/face?size=64&layers=all`,
    name: name ?? `${ownerUuid.slice(0, 8)}…`,
  };
}

// Browser navigation and form posts never see raw JSON envelopes: expired or
// invalid interactions become a friendly page (or a redirect back to it),
// while unexpected failures still reach the centralized JSON handler.
export function isInteractionClientError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return (
      error.code === 'bad_request' ||
      error.code === 'interaction_expired' ||
      error.code === 'interaction_invalid'
    );
  }
  return error instanceof OAuthInteractionStateError || error instanceof VerificationStateError;
}

function interactionPageUrl(uid: string): string {
  return `/interaction/${encodeURIComponent(uid)}`;
}

async function sendInteractionErrorPage(reply: FastifyReply, error: unknown): Promise<boolean> {
  let kind: InteractionErrorKind | undefined;
  let statusCode = 404;
  if (error instanceof ApiError && error.code === 'interaction_expired') {
    kind = 'expired';
    statusCode = 410;
  } else if (isInteractionClientError(error)) {
    kind = 'invalid';
  }
  if (kind === undefined) {
    return false;
  }
  setInteractionHeaders(reply);
  await reply
    .status(statusCode)
    .type('text/html; charset=utf-8')
    .send(renderInteractionErrorPage(kind));
  return true;
}

function setInteractionHeaders(reply: FastifyReply): void {
  void reply.headers({
    'cache-control': 'no-store',
    'content-security-policy': PAGE_CONTENT_SECURITY_POLICY,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
}
