import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance, FastifyReply } from 'fastify';

import { english } from '../locales/en.js';
import type {
  OAuthInteractionAbortion,
  OAuthInteractionCompletion,
  PendingOAuthInteraction,
} from '../oauth/interaction-service.js';
import type { VerificationStatus } from '../verification/types.js';
import { ApiError } from './errors.js';
import { interactionScript, interactionStyles } from './interaction-assets.js';
import { renderInteractionPage } from './interaction-page.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';
import { verificationStatusRateLimit } from './rate-limit.js';
import {
  interactionAbortRouteSchema,
  interactionAssetRouteSchema,
  interactionCompleteRouteSchema,
  interactionPageRouteSchema,
  interactionStatusRouteSchema,
} from './schemas.js';

interface InteractionParams {
  readonly uid: string;
}

export interface ApiInteractionService {
  abort(
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
}

export interface ClientNameLookup {
  findClientName(clientId: string): Promise<string | undefined>;
}

export interface InteractionRoutesOptions {
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

      setInteractionHeaders(reply);
      await reply.type('text/html; charset=utf-8').send(
        renderInteractionPage({
          appName,
          code: interaction.code,
          interactionId: interaction.interactionId,
          minecraftBaseDomain: options.minecraftBaseDomain,
          scope: interaction.scope,
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
      const abortion = await options.interactions.abort(
        request.raw,
        reply.raw,
        request.params.uid,
      );
      await reply.redirect(abortion.redirectTo, 303);
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
