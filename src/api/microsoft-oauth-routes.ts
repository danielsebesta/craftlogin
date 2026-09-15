import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { english } from '../locales/en.js';
import { getErrorKind } from '../logging/error-kind.js';
import {
  MicrosoftJavaOwnershipRequiredError,
  MicrosoftOAuthHttpError,
  MicrosoftOAuthUnavailableError,
} from '../verification/microsoft-oauth-client.js';
import {
  MicrosoftOAuthVerificationService,
  MicrosoftVerificationResolutionError,
} from '../verification/microsoft-oauth-verification-service.js';
import { ApiError } from './errors.js';
import { isInteractionClientError } from './interaction-routes.js';
import {
  renderMicrosoftOAuthResultPage,
  type MicrosoftOAuthResultPageInput,
} from './microsoft-oauth-result-page.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';
import { microsoftVerificationRateLimit } from './rate-limit.js';
import { microsoftOAuthCallbackRouteSchema, microsoftOAuthStartRouteSchema } from './schemas.js';

const TRANSACTION_TTL_SECONDS = 5 * 60;
const COOKIE_PREFIX = '__Secure-craftlogin_ms_';
const CALLBACK_PATH = '/interaction/microsoft/callback';
const transactionSchema = z.object({
  codeVerifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  interactionId: z.string().min(1).max(512),
});

interface InteractionParams {
  readonly uid: string;
}

interface MicrosoftCallbackQuery {
  readonly code?: string;
  readonly error?: string;
  readonly error_description?: string;
  readonly state: string;
}

export interface MicrosoftOAuthInteractionService {
  prepareMicrosoft(
    request: IncomingMessage,
    response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<{ readonly interactionId: string }>;
}

export interface MicrosoftOAuthRoutesOptions {
  readonly interactions: MicrosoftOAuthInteractionService;
  readonly verification: Pick<
    MicrosoftOAuthVerificationService,
    'createAuthorizationUrl' | 'verify'
  >;
  readonly logger: FastifyBaseLogger;
}

export function registerMicrosoftOAuthRoutes(
  server: FastifyInstance,
  options: MicrosoftOAuthRoutesOptions,
): void {
  // A plain link (GET) starts verification: the server answers with a 303 redirect
  // to the Microsoft authorize endpoint, and GET navigations are not restricted
  // by form-action. A POST form would have its cross-origin redirect blocked.
  server.get<{ Params: InteractionParams }>(
    '/interaction/:uid/microsoft/start',
    {
      config: { rateLimit: microsoftVerificationRateLimit },
      schema: microsoftOAuthStartRouteSchema,
    },
    async (request, reply): Promise<void> => {
      let interaction: { readonly interactionId: string };
      try {
        interaction = await options.interactions.prepareMicrosoft(
          request.raw,
          reply.raw,
          request.params.uid,
        );
      } catch (error: unknown) {
        if (isInteractionClientError(error)) {
          await reply.redirect(`/interaction/${encodeURIComponent(request.params.uid)}`, 303);
          return;
        }
        throw error;
      }
      const transaction = createTransaction(interaction.interactionId);
      void reply.setCookie(transaction.cookieName, encodeTransaction(transaction), {
        httpOnly: true,
        maxAge: TRANSACTION_TTL_SECONDS,
        path: CALLBACK_PATH,
        priority: 'high',
        sameSite: 'lax',
        secure: true,
        signed: true,
      });
      await reply.redirect(
        options.verification.createAuthorizationUrl(transaction.state, transaction.codeChallenge),
        303,
      );
    },
  );

  server.get<{ Querystring: MicrosoftCallbackQuery }>(
    CALLBACK_PATH,
    {
      attachValidation: true,
      config: { rateLimit: microsoftVerificationRateLimit },
      schema: microsoftOAuthCallbackRouteSchema,
    },
    async (request, reply): Promise<void> => {
      // Browser callback: malformed Microsoft querystrings become the friendly
      // expired page, never a JSON envelope (the OpenAPI contract promises
      // HTML for this route).
      if (request.validationError !== undefined) {
        await sendResultPage(reply, 400, { kind: 'expired' });
        return;
      }
      let transaction: StoredMicrosoftOAuthTransaction;
      try {
        transaction = readTransaction(
          request.cookies,
          request.query.state,
          (value): ReturnType<typeof request.unsignCookie> => request.unsignCookie(value),
        );
      } catch (error: unknown) {
        if (error instanceof ApiError) {
          await sendResultPage(reply, 400, { kind: 'expired' });
          return;
        }
        throw error;
      }
      clearTransactionCookie(reply, transaction.cookieName);
      await options.interactions.prepareMicrosoft(
        request.raw,
        reply.raw,
        transaction.interactionId,
      );

      const homeUrl = homeUrlForInteraction(transaction.interactionId);
      if (request.query.error !== undefined) {
        if (request.query.error === 'access_denied') {
          await reply.redirect(homeUrl, 303);
          return;
        }
        await sendResultPage(reply, 400, {
          homeUrl,
          interactionId: transaction.interactionId,
          kind: 'rejected',
        });
        return;
      }
      const authorizationCode = request.query.code;
      if (authorizationCode === undefined) {
        await sendResultPage(reply, 400, {
          homeUrl,
          interactionId: transaction.interactionId,
          kind: 'rejected',
        });
        return;
      }

      try {
        const identity = await options.verification.verify(
          transaction.interactionId,
          authorizationCode,
          transaction.codeVerifier,
        );
        setResultHeaders(reply);
        await reply.type('text/html; charset=utf-8').send(
          renderMicrosoftOAuthResultPage({
            homeUrl,
            interactionId: transaction.interactionId,
            kind: 'success',
            username: identity.player.username,
          }),
        );
      } catch (error: unknown) {
        if (error instanceof MicrosoftJavaOwnershipRequiredError) {
          setResultHeaders(reply);
          await reply
            .status(403)
            .type('text/html; charset=utf-8')
            .send(
              renderMicrosoftOAuthResultPage({
                homeUrl,
                interactionId: transaction.interactionId,
                kind: 'ownership-required',
              }),
            );
          return;
        }
        if (error instanceof MicrosoftVerificationResolutionError) {
          await sendResultPage(reply, 409, { homeUrl, kind: 'expired' });
          return;
        }
        if (error instanceof MicrosoftOAuthUnavailableError) {
          // The message carries only the failed stage (for example which
          // token endpoint rejected the request) and never token material.
          options.logger.warn(
            {
              errorKind: getErrorKind(error),
              reason: error.message,
              ...(error instanceof MicrosoftOAuthHttpError
                ? { endpoint: error.endpoint, upstreamStatusCode: error.statusCode }
                : {}),
            },
            'Microsoft verification step failed',
          );
          await sendResultPage(reply, 503, {
            homeUrl,
            interactionId: transaction.interactionId,
            kind: 'temporarily-unavailable',
          });
          return;
        }
        throw error;
      }
    },
  );
}

function homeUrlForInteraction(interactionId: string): string {
  return `/interaction/${encodeURIComponent(interactionId)}`;
}

interface MicrosoftOAuthTransaction {
  readonly codeChallenge: string;
  readonly codeVerifier: string;
  readonly cookieName: string;
  readonly interactionId: string;
  readonly state: string;
}

type StoredMicrosoftOAuthTransaction = Pick<
  MicrosoftOAuthTransaction,
  'codeVerifier' | 'cookieName' | 'interactionId' | 'state'
>;

function createTransaction(interactionId: string): MicrosoftOAuthTransaction {
  const state = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  return {
    codeChallenge: createHash('sha256').update(codeVerifier, 'ascii').digest('base64url'),
    codeVerifier,
    cookieName: `${COOKIE_PREFIX}${state}`,
    interactionId,
    state,
  };
}

function encodeTransaction(transaction: MicrosoftOAuthTransaction): string {
  return Buffer.from(
    JSON.stringify({
      codeVerifier: transaction.codeVerifier,
      interactionId: transaction.interactionId,
    }),
    'utf8',
  ).toString('base64url');
}

function readTransaction(
  cookies: Readonly<Record<string, string | undefined>>,
  state: string,
  unsignCookie: (value: string) => {
    readonly renew: boolean;
    readonly valid: boolean;
    readonly value: string | null;
  },
): StoredMicrosoftOAuthTransaction {
  const cookieName = `${COOKIE_PREFIX}${state}`;
  const signedValue = cookies[cookieName];
  if (signedValue === undefined) {
    throw new ApiError(400, 'bad_request', english.api.errors.microsoftStateInvalid);
  }
  const unsigned = unsignCookie(signedValue);
  if (!unsigned.valid || unsigned.value === null) {
    throw new ApiError(400, 'bad_request', english.api.errors.microsoftStateInvalid);
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(unsigned.value, 'base64url').toString('utf8'));
  } catch {
    throw new ApiError(400, 'bad_request', english.api.errors.microsoftStateInvalid);
  }
  const parsed = transactionSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new ApiError(400, 'bad_request', english.api.errors.microsoftStateInvalid);
  }
  return {
    codeVerifier: parsed.data.codeVerifier,
    cookieName,
    interactionId: parsed.data.interactionId,
    state,
  };
}

function clearTransactionCookie(reply: FastifyReply, cookieName: string): void {
  void reply.clearCookie(cookieName, {
    httpOnly: true,
    path: CALLBACK_PATH,
    sameSite: 'lax',
    secure: true,
  });
}

async function sendResultPage(
  reply: FastifyReply,
  statusCode: 400 | 409 | 503,
  input: MicrosoftOAuthResultPageInput,
): Promise<void> {
  setResultHeaders(reply);
  await reply
    .status(statusCode)
    .type('text/html; charset=utf-8')
    .send(renderMicrosoftOAuthResultPage(input));
}

function setResultHeaders(reply: FastifyReply): void {
  void reply.headers({
    'cache-control': 'no-store',
    'content-security-policy': PAGE_CONTENT_SECURITY_POLICY,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
}
