import type { FastifyInstance, FastifySchema } from 'fastify';

import { ERROR_RESPONSE_SCHEMA_ID } from './schemas.js';

const healthRouteSchema: FastifySchema = {
  response: {
    200: {
      additionalProperties: false,
      properties: { status: { enum: ['ok'], type: 'string' } },
      required: ['status'],
      type: 'object',
    },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

// A degraded database or Redis client can stall a probe forever; the check gets
// its own bound so orchestrators see a fast failure instead of a hung probe.
const READINESS_TIMEOUT_MS = 2_000;

export interface ReadinessCheck {
  check(): Promise<void>;
}

export function registerHealthRoute(server: FastifyInstance, readiness: ReadinessCheck): void {
  server.get('/health', { schema: healthRouteSchema }, async (_request, reply): Promise<void> => {
    await checkReadiness(readiness);
    void reply.header('cache-control', 'no-store');
    await reply.send({ status: 'ok' });
  });
}

async function checkReadiness(readiness: ReadinessCheck): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      readiness.check(),
      new Promise<never>((_resolve, reject): void => {
        timer = setTimeout((): void => {
          reject(new Error('Readiness check timed out'));
        }, READINESS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
