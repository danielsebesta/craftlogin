import type { FastifyInstance, FastifySchema } from 'fastify';

const microsoftIdentityAssociationRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: {
      additionalProperties: false,
      properties: {
        associatedApplications: {
          items: {
            additionalProperties: false,
            properties: {
              applicationId: { format: 'uuid', type: 'string' },
            },
            required: ['applicationId'],
            type: 'object',
          },
          minItems: 1,
          type: 'array',
        },
      },
      required: ['associatedApplications'],
      type: 'object',
    },
  },
};

export function registerMicrosoftIdentityAssociationRoute(
  server: FastifyInstance,
  applicationId: string,
): void {
  server.get(
    '/.well-known/microsoft-identity-association.json',
    { schema: microsoftIdentityAssociationRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=3600');
      await reply.type('application/json').send({
        associatedApplications: [{ applicationId }],
      });
    },
  );
}
