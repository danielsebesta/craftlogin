import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance, FastifyReply } from 'fastify';

import { english } from '../locales/en.js';
import type {
  OAuthInteractionAbortion,
  OAuthInteractionCompletion,
  PendingOAuthInteraction,
} from '../oauth/interaction-service.js';
import type { VerificationStatus } from '../verification/types.js';
import type { SkinVerificationChallenge } from '../verification/redis-skin-verification-store.js';
import {
  SkinVerificationPlayerNotFoundError,
  SkinVerificationResolutionError,
} from '../verification/skin-verification-service.js';
import { ApiError } from './errors.js';
import { interactionScript, interactionStyles } from './interaction-assets.js';
import { renderInteractionPage } from './interaction-page.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';
import { skinVerificationStartRateLimit, verificationStatusRateLimit } from './rate-limit.js';
import {
  interactionAbortRouteSchema,
  interactionAssetRouteSchema,
  interactionCompleteRouteSchema,
  interactionPageRouteSchema,
  interactionStatusRouteSchema,
  skinVerificationDownloadRouteSchema,
  skinVerificationStartRouteSchema,
  skinVerificationStatusRouteSchema,
} from './schemas.js';

interface InteractionParams {
  readonly uid: string;
}

interface SkinVerificationBody {
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
  checkSkin?(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<VerificationStatus>;
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

export interface ClientNameLookup {
  findClientName(clientId: string): Promise<string | undefined>;
}

export interface AccountNameLookup {
  findCurrentUser(uuid: string): Promise<{ readonly username: string } | undefined>;
}

export interface InteractionRoutesOptions {
  readonly accounts?: AccountNameLookup;
  readonly clients: ClientNameLookup;
  readonly interactions: ApiInteractionService;
  readonly minecraftBaseDomain: string;
}

export function registerInteractionRoutes(
  server: FastifyInstance,
  options: InteractionRoutesOptions,
): void {
  server.get<{ Params: InteractionParams }>(
    '/interaction/:uid',
    { schema: interactionPageRouteSchema },
    async (request, reply): Promise<void> => {
      const interaction = await options.interactions.start(
        request.raw,
        reply.raw,
        request.params.uid,
      );
      const appName =
        (await options.clients.findClientName(interaction.clientId)) ?? interaction.clientId;
      const account =
        interaction.accountId === undefined || options.accounts === undefined
          ? undefined
          : await options.accounts.findCurrentUser(interaction.accountId);

      setInteractionHeaders(reply);
      await reply.type('text/html; charset=utf-8').send(
        renderInteractionPage({
          appName,
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
      const abortion = await options.interactions.abort(request.raw, reply.raw, request.params.uid);
      await reply.redirect(abortion.redirectTo, 303);
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
      const completion = await options.interactions.complete(
        request.raw,
        reply.raw,
        request.params.uid,
      );
      if (completion.status === 'expired') {
        throw new ApiError(410, 'interaction_expired', english.api.errors.interactionExpired);
      }

      const destination =
        completion.status === 'complete'
          ? completion.redirectTo
          : `/interaction/${encodeURIComponent(request.params.uid)}`;
      await reply.redirect(destination, 303);
    },
  );

  server.post<{ Params: InteractionParams }>(
    '/interaction/:uid/switch',
    { schema: interactionAbortRouteSchema },
    async (request, reply): Promise<void> => {
      if (options.interactions.switchAccount === undefined) {
        throw new ApiError(501, 'internal_error', english.api.errors.internal);
      }
      const result = await options.interactions.switchAccount(
        request.raw,
        reply.raw,
        request.params.uid,
      );
      await reply.redirect(result.redirectTo, 303);
    },
  );

  server.get(
    '/assets/interaction.css',
    { schema: interactionAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=3600');
      await reply.type('text/css; charset=utf-8').send(interactionStyles);
    },
  );

  server.get(
    '/assets/interaction.js',
    { schema: interactionAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=3600');
      await reply.type('text/javascript; charset=utf-8').send(interactionScript);
    },
  );
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
