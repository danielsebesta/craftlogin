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

export interface ReadinessCheck {
  check(): Promise<void>;
}

export function registerHealthRoute(server: FastifyInstance, readiness: ReadinessCheck): void {
  server.get('/health', { schema: healthRouteSchema }, async (_request, reply): Promise<void> => {
    await readiness.check();
    void reply.header('cache-control', 'no-store');
    await reply.send({ status: 'ok' });
  });
}
