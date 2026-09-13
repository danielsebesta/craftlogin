import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { english } from '../locales/en.js';
import {
  MicrosoftJavaOwnershipRequiredError,
  MicrosoftOAuthUnavailableError,
} from '../verification/microsoft-oauth-client.js';
import {
  MicrosoftOAuthVerificationService,
  MicrosoftVerificationResolutionError,
} from '../verification/microsoft-oauth-verification-service.js';
import { ApiError } from './errors.js';
import { renderMicrosoftOAuthResultPage } from './microsoft-oauth-result-page.js';
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
}

export function registerMicrosoftOAuthRoutes(
  server: FastifyInstance,
  options: MicrosoftOAuthRoutesOptions,
): void {
  server.post<{ Params: InteractionParams }>(
    '/interaction/:uid/microsoft/start',
    {
      config: { rateLimit: microsoftVerificationRateLimit },
      schema: microsoftOAuthStartRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const interaction = await options.interactions.prepareMicrosoft(
        request.raw,
        reply.raw,
        request.params.uid,
      );
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
      config: { rateLimit: microsoftVerificationRateLimit },
      schema: microsoftOAuthCallbackRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const transaction = readTransaction(
        request.cookies,
        request.query.state,
        (value): ReturnType<typeof request.unsignCookie> => request.unsignCookie(value),
      );
      clearTransactionCookie(reply, transaction.cookieName);
      await options.interactions.prepareMicrosoft(
        request.raw,
        reply.raw,
        transaction.interactionId,
      );

      if (request.query.error !== undefined) {
        if (request.query.error === 'access_denied') {
          await reply.redirect(
            `/interaction/${encodeURIComponent(transaction.interactionId)}`,
            303,
          );
          return;
        }
        throw new ApiError(400, 'bad_request', english.api.errors.microsoftSignInRejected);
      }
      const authorizationCode = request.query.code;
      if (authorizationCode === undefined) {
        throw new ApiError(400, 'bad_request', english.api.errors.badRequest);
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
                interactionId: transaction.interactionId,
                kind: 'ownership-required',
              }),
            );
          return;
        }
        if (error instanceof MicrosoftVerificationResolutionError) {
          throw new ApiError(409, 'interaction_invalid', english.api.errors.interactionInvalid, {
            cause: error,
          });
        }
        if (error instanceof MicrosoftOAuthUnavailableError) {
          throw new ApiError(
            503,
            'service_unavailable',
            english.api.errors.microsoftSignInUnavailable,
            { cause: error },
          );
        }
        throw error;
      }
    },
  );
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

function setResultHeaders(reply: FastifyReply): void {
  void reply.headers({
    'cache-control': 'no-store',
    'content-security-policy': PAGE_CONTENT_SECURITY_POLICY,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
}
