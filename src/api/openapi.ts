import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import type { OpenAPIV3_1 } from 'openapi-types';

import { english } from '../locales/en.js';
import { swaggerThemeStyles } from './swagger-theme.js';

const PUBLIC_PATHS = new Set([
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
  '/.well-known/webfinger',
  '/api/apps/{clientId}/icon',
  '/api/avatars/{identifier}/back',
  '/api/avatars/{identifier}/body',
  '/api/avatars/{identifier}/bust',
  '/api/avatars/{identifier}/cape',
  '/api/avatars/{identifier}/capes',
  '/api/avatars/{identifier}/duo',
  '/api/avatars/{identifier}/elytra',
  '/api/avatars/{identifier}/face',
  '/api/avatars/{identifier}/side',
  '/api/avatars/{identifier}/wings',
  '/api/avatars/{identifier}/processed-skin',
  '/api/avatars/{identifier}/skin',
  '/api/users/@me',
  '/api/users/{identifier}',
  '/oauth2/authorize',
  '/oauth2/introspect',
  '/oauth2/jwks',
  '/oauth2/logout',
  '/oauth2/revoke',
  '/oauth2/token',
  '/oauth2/userinfo',
]);

const PUBLIC_SCHEMAS = new Set([
  'craftlogin.error-response',
  'craftlogin.user-response',
  'craftlogin.capes-response',
]);
const PUBLIC_TAGS = new Set(['Applications', 'Avatars', 'Identity', 'OAuth']);

function publicOpenApiPath(url: string): string {
  return url.replaceAll(/:([A-Za-z][A-Za-z0-9_]*)/gu, '{$1}');
}

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
          oauth2: {
            flows: {
              authorizationCode: {
                authorizationUrl: `${options.issuer}/oauth2/authorize`,
                scopes: {
                  offline_access: documentation.scopes.offlineAccess,
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
        { description: documentation.tags.identity, name: 'Identity' },
        { description: documentation.tags.avatars, name: 'Avatars' },
        { description: documentation.tags.applications, name: 'Applications' },
      ],
    },
    transform: ({ schema, url }) => ({
      schema: PUBLIC_PATHS.has(publicOpenApiPath(url)) ? schema : { ...schema, hide: true },
      url,
    }),
    transformObject: (document) => {
      if ('swaggerObject' in document) return document.swaggerObject;

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the plugin is configured above to emit OpenAPI 3.1
      const source = document.openapiObject as Partial<OpenAPIV3_1.Document>;
      const schemas = Object.fromEntries(
        Object.entries(source.components?.schemas ?? {}).filter(([name]): boolean =>
          PUBLIC_SCHEMAS.has(name),
        ),
      );
      const securitySchemes = Object.fromEntries(
        Object.entries(source.components?.securitySchemes ?? {}).filter(
          ([name]): boolean => name !== 'developerSession',
        ),
      );

      return {
        ...source,
        components: { ...source.components, schemas, securitySchemes },
        tags: (source.tags ?? []).filter((tag): boolean => PUBLIC_TAGS.has(tag.name)),
      };
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
      routePrefix: '/docs/swagger',
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
