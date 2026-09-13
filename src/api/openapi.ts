import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

import { english } from '../locales/en.js';
import { swaggerThemeStyles } from './swagger-theme.js';

export interface OpenApiOptions {
  readonly issuer: string;
  readonly nodeEnvironment: 'development' | 'production' | 'test';
}

export async function registerOpenApi(
  server: FastifyInstance,
  options: OpenApiOptions,
): Promise<void> {
  const documentation = english.api.documentation;
  await server.register(swagger, {
    openapi: {
      components: {
        securitySchemes: {
          bearerAuth: {
            bearerFormat: 'opaque',
            scheme: 'bearer',
            type: 'http',
          },
          developerSession: {
            in: 'cookie',
            name: '__Host-craftlogin_developer_session',
            type: 'apiKey',
          },
          oauth2: {
            flows: {
              authorizationCode: {
                authorizationUrl: `${options.issuer}/oauth2/authorize`,
                scopes: {
                  openid: documentation.scopes.openid,
                  profile: documentation.scopes.profile,
                },
                tokenUrl: `${options.issuer}/oauth2/token`,
              },
            },
            type: 'oauth2',
          },
        },
      },
      info: {
        description: documentation.description,
        license: { name: 'MIT' },
        title: documentation.title,
        version: '0.1.0',
      },
      openapi: '3.1.0',
      servers: [{ url: options.issuer }],
      tags: [
        { description: documentation.tags.oauth, name: 'OAuth' },
        { description: documentation.tags.interactions, name: 'Interactions' },
        { description: documentation.tags.identity, name: 'Identity' },
        { description: documentation.tags.avatars, name: 'Avatars' },
        { description: documentation.tags.applications, name: 'Applications' },
      ],
    },
    refResolver: {
      buildLocalReference: (schema, _baseUri, _fragment, index): string => {
        const identifier = schema['$id'];
        return typeof identifier === 'string'
          ? identifier.replaceAll(/[^A-Za-z0-9._-]/gu, '-')
          : `schema-${index.toString()}`;
      },
    },
  });

  if (options.nodeEnvironment !== 'production') {
    await server.register(swaggerUi, {
      routePrefix: '/docs',
      staticCSP: true,
      theme: {
        css: [{ content: swaggerThemeStyles, filename: 'craftlogin.css' }],
        title: 'CraftLogin API',
      },
      uiConfig: {
        deepLinking: true,
        docExpansion: 'list',
        persistAuthorization: false,
        validatorUrl: 'none',
      },
    });
  }
}
