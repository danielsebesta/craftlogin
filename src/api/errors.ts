import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { english } from '../locales/en.js';
import { getErrorKind } from '../logging/error-kind.js';
import { OAuthInteractionStateError } from '../oauth/interaction-gateway.js';
import { VerificationStateError } from '../verification/redis-verification-store.js';

export type ApiErrorCode =
  | 'bad_request'
  | 'developer_unauthorized'
  | 'interaction_expired'
  | 'interaction_invalid'
  | 'insufficient_scope'
  | 'internal_error'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'unauthorized';

export class ApiError extends Error {
  public override readonly name = 'ApiError';

  public constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function registerErrorHandling(server: FastifyInstance): void {
  server.setNotFoundHandler(async (_request, reply): Promise<void> => {
    await sendError(reply, 404, 'not_found', english.api.errors.notFound);
  });

  server.setErrorHandler(
    async (error: Error, request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (error instanceof ApiError) {
        await sendError(reply, error.statusCode, error.code, error.message);
        return;
      }

      if (isValidationError(error)) {
        await sendError(reply, 400, 'bad_request', english.api.errors.badRequest);
        return;
      }

      const clientErrorStatus = getClientErrorStatus(error);
      if (clientErrorStatus !== undefined) {
        await sendError(reply, clientErrorStatus, 'bad_request', english.api.errors.badRequest);
        return;
      }

      if (error instanceof OAuthInteractionStateError || error instanceof VerificationStateError) {
        await sendError(reply, 409, 'interaction_invalid', english.api.errors.interactionInvalid);
        return;
      }

      request.log.error(
        { errorKind: getErrorKind(error), requestId: request.id },
        'API request failed',
      );
      await sendError(reply, 500, 'internal_error', english.api.errors.internal);
    },
  );
}

function isValidationError(error: Error): boolean {
  return error instanceof z.ZodError || 'validation' in error;
}

function getClientErrorStatus(error: Error): number | undefined {
  if (!('statusCode' in error)) {
    return undefined;
  }
  const statusCode = error.statusCode;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
    ? statusCode
    : undefined;
}

async function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
): Promise<void> {
  void reply.header('cache-control', 'no-store');
  if (statusCode === 401 && code === 'unauthorized') {
    void reply.header('www-authenticate', 'Bearer');
  } else if (statusCode === 403 && code === 'insufficient_scope') {
    void reply.header('www-authenticate', 'Bearer error="insufficient_scope", scope="profile"');
  }
  await reply.status(statusCode).send({ error: { code, message } });
}
