import type { FastifyInstance, FastifySchema } from 'fastify';

import { english } from '../locales/en.js';

const operations = english.api.documentation.operations;
const appNameJsonSchema = {
  maxLength: 100,
  minLength: 1,
  pattern: '^(?!\\s)(?!.*\\s$)[^\\u0000-\\u001F\\u007F-\\u009F]+$',
  type: 'string',
};
const redirectUriJsonSchema = {
  format: 'uri',
  maxLength: 2_048,
  pattern: '^(?:https://|http://(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::|/))',
  type: 'string',
};

export const ERROR_RESPONSE_SCHEMA_ID = 'craftlogin.error-response';
export const USER_RESPONSE_SCHEMA_ID = 'craftlogin.user-response';
export const APP_RESPONSE_SCHEMA_ID = 'craftlogin.app-response';
export const MANAGED_APP_RESPONSE_SCHEMA_ID = 'craftlogin.managed-app-response';

const errorResponseSchema = {
  $id: ERROR_RESPONSE_SCHEMA_ID,
  additionalProperties: false,
  properties: {
    error: {
      additionalProperties: false,
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['code', 'message'],
      type: 'object',
    },
  },
  required: ['error'],
  type: 'object',
};

const userResponseSchema = {
  $id: USER_RESPONSE_SCHEMA_ID,
  additionalProperties: false,
  properties: {
    username: { maxLength: 16, minLength: 1, type: 'string' },
    uuid: { format: 'uuid', type: 'string' },
  },
  required: ['uuid', 'username'],
  type: 'object',
};

const appResponseSchema = {
  $id: APP_RESPONSE_SCHEMA_ID,
  additionalProperties: false,
  properties: {
    clientId: { type: 'string' },
    clientSecret: { type: 'string' },
    clientType: { enum: ['public', 'confidential'], type: 'string' },
    createdAt: { format: 'date-time', type: 'string' },
    id: { format: 'uuid', type: 'string' },
    name: appNameJsonSchema,
    redirectUris: {
      items: redirectUriJsonSchema,
      minItems: 1,
      type: 'array',
      uniqueItems: true,
    },
  },
  required: ['id', 'clientId', 'clientType', 'name', 'redirectUris', 'createdAt'],
  type: 'object',
};

const managedAppResponseSchema = {
  $id: MANAGED_APP_RESPONSE_SCHEMA_ID,
  additionalProperties: false,
  properties: {
    clientId: { type: 'string' },
    clientType: { enum: ['public', 'confidential'], type: 'string' },
    createdAt: { format: 'date-time', type: 'string' },
    id: { format: 'uuid', type: 'string' },
    name: appNameJsonSchema,
    ownerUuid: { format: 'uuid', type: 'string' },
    redirectUris: {
      items: redirectUriJsonSchema,
      minItems: 1,
      type: 'array',
      uniqueItems: true,
    },
  },
  required: ['id', 'clientId', 'clientType', 'name', 'redirectUris', 'createdAt'],
  type: 'object',
};

const interactionParamsSchema = {
  additionalProperties: false,
  properties: {
    uid: { maxLength: 512, minLength: 1, pattern: '^[A-Za-z0-9_-]+$', type: 'string' },
  },
  required: ['uid'],
  type: 'object',
};

const appRegistrationBodySchema = {
  additionalProperties: false,
  properties: {
    clientType: { enum: ['public', 'confidential'], type: 'string' },
    name: appNameJsonSchema,
    redirectUris: {
      items: redirectUriJsonSchema,
      maxItems: 20,
      minItems: 1,
      type: 'array',
      uniqueItems: true,
    },
  },
  required: ['clientType', 'name', 'redirectUris'],
  type: 'object',
};

const csrfHeadersSchema = {
  additionalProperties: true,
  properties: {
    'x-csrf-token': { minLength: 1, type: 'string' },
  },
  required: ['x-csrf-token'],
  type: 'object',
};

const csrfFormProperty = { maxLength: 128, minLength: 1, type: 'string' };
const developerRoleProperty = { enum: ['developer', 'admin'], type: 'string' };
const minecraftUuidProperty = {
  format: 'uuid',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  type: 'string',
};
const avatarUuidProperty = {
  pattern: '^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-fA-F]{32})$',
  type: 'string',
};
const avatarParamsSchema = {
  additionalProperties: false,
  properties: { uuid: avatarUuidProperty },
  required: ['uuid'],
  type: 'object',
};
const playerIdentifierParamsSchema = {
  additionalProperties: false,
  properties: {
    identifier: {
      pattern:
        '^(?:[A-Za-z0-9_]{3,16}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-fA-F]{32})$',
      type: 'string',
    },
  },
  required: ['identifier'],
  type: 'object',
};
const avatarRenderQuerySchema = {
  additionalProperties: false,
  properties: {
    layers: { default: 'all', enum: ['base', 'all'], type: 'string' },
    size: { default: '128', enum: ['32', '64', '128', '256'], type: 'string' },
  },
  type: 'object',
};
const emptyQuerySchema = { additionalProperties: false, properties: {}, type: 'object' };
const pngResponseSchema = {
  content: { 'image/png': { schema: { format: 'binary', type: 'string' } } },
  headers: {
    'cache-control': { type: 'string' },
    etag: { type: 'string' },
  },
};
const appIdParamsSchema = {
  additionalProperties: false,
  properties: { id: { format: 'uuid', type: 'string' } },
  required: ['id'],
  type: 'object',
};
const developerUuidParamsSchema = {
  additionalProperties: false,
  properties: { uuid: minecraftUuidProperty },
  required: ['uuid'],
  type: 'object',
};
const htmlResponseSchema = {
  content: { 'text/html': { schema: { type: 'string' } } },
};

const bearerHeadersSchema = {
  additionalProperties: true,
  properties: {
    authorization: { minLength: 8, type: 'string' },
  },
  type: 'object',
};

const verificationStatusSchema = {
  additionalProperties: false,
  properties: {
    status: { enum: ['expired', 'pending', 'verified'], type: 'string' },
  },
  required: ['status'],
  type: 'object',
};

const oauthErrorSchema = {
  additionalProperties: true,
  properties: {
    error: { type: 'string' },
    error_description: { type: 'string' },
  },
  required: ['error'],
  type: 'object',
};

const oauthTokenResponseSchema = {
  additionalProperties: true,
  properties: {
    access_token: { type: 'string' },
    expires_in: { minimum: 1, type: 'integer' },
    id_token: { type: 'string' },
    refresh_token: { type: 'string' },
    scope: { type: 'string' },
    token_type: { type: 'string' },
  },
  required: ['access_token', 'token_type'],
  type: 'object',
};

export function registerSharedSchemas(server: FastifyInstance): void {
  server.addSchema(errorResponseSchema);
  server.addSchema(userResponseSchema);
  server.addSchema(appResponseSchema);
  server.addSchema(managedAppResponseSchema);
}

export const interactionPageRouteSchema: FastifySchema = {
  description: operations.interactionPage.description,
  params: interactionParamsSchema,
  response: {
    200: {
      content: {
        'text/html': {
          schema: { type: 'string' },
        },
      },
      description: operations.interactionPage.response,
    },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    409: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.interactionPage.summary,
  tags: ['Interactions'],
};

export const interactionStatusRouteSchema: FastifySchema = {
  description: operations.interactionStatus.description,
  params: interactionParamsSchema,
  response: {
    200: verificationStatusSchema,
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    409: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.interactionStatus.summary,
  tags: ['Interactions'],
};

const skinVerificationBodySchema = {
  additionalProperties: false,
  properties: {
    username: {
      maxLength: 16,
      minLength: 3,
      pattern: '^[A-Za-z0-9_]+$',
      type: 'string',
    },
  },
  required: ['username'],
  type: 'object',
};

export const skinVerificationStartRouteSchema: FastifySchema = {
  body: skinVerificationBodySchema,
  description: operations.skinVerificationStart.description,
  params: interactionParamsSchema,
  response: {
    303: { type: 'null' },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    409: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    503: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.skinVerificationStart.summary,
  tags: ['Interactions'],
};

export const skinVerificationStatusRouteSchema: FastifySchema = {
  description: operations.skinVerificationStatus.description,
  params: interactionParamsSchema,
  response: {
    200: verificationStatusSchema,
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    409: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    503: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.skinVerificationStatus.summary,
  tags: ['Interactions'],
};

export const skinVerificationDownloadRouteSchema: FastifySchema = {
  params: interactionParamsSchema,
  response: {
    200: {
      content: { 'image/png': { schema: { format: 'binary', type: 'string' } } },
      description: operations.skinVerificationDownload.summary,
    },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    409: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.skinVerificationDownload.summary,
  tags: ['Interactions'],
};

export const interactionCompleteRouteSchema: FastifySchema = {
  description: operations.completeInteraction.description,
  params: interactionParamsSchema,
  response: {
    303: { type: 'null' },
    410: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    409: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.completeInteraction.summary,
  tags: ['Interactions'],
};

export const interactionAbortRouteSchema: FastifySchema = {
  description: operations.abortInteraction.description,
  params: interactionParamsSchema,
  response: {
    303: { type: 'null' },
    409: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.abortInteraction.summary,
  tags: ['Interactions'],
};

export const interactionAssetRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: { type: 'string' },
  },
};

export const landingPageRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: {
      content: {
        'text/html': {
          schema: { type: 'string' },
        },
      },
      description: english.landing.hero.lead,
    },
  },
};

export const landingAssetRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: { type: 'string' },
  },
};

export const currentUserRouteSchema: FastifySchema = {
  description: operations.currentUser.description,
  headers: bearerHeadersSchema,
  response: {
    200: { $ref: `${USER_RESPONSE_SCHEMA_ID}#` },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    401: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    403: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  security: [{ bearerAuth: [] }],
  summary: operations.currentUser.summary,
  tags: ['Identity'],
};

export const playerProfileRouteSchema: FastifySchema = {
  description: operations.playerProfile.description,
  params: playerIdentifierParamsSchema,
  querystring: emptyQuerySchema,
  response: {
    200: {
      $ref: `${USER_RESPONSE_SCHEMA_ID}#`,
      headers: { 'cache-control': { type: 'string' } },
    },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    503: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.playerProfile.summary,
  tags: ['Identity'],
};

export const playerProfilePreflightRouteSchema: FastifySchema = {
  hide: true,
  params: playerIdentifierParamsSchema,
  response: {
    204: { type: 'null' },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const appRegistrationRouteSchema: FastifySchema = {
  body: appRegistrationBodySchema,
  description: operations.appRegistration.description,
  headers: csrfHeadersSchema,
  response: {
    201: { $ref: `${APP_RESPONSE_SCHEMA_ID}#` },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    401: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    403: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.appRegistration.summary,
  security: [{ developerSession: [] }],
  tags: ['Applications'],
};

export const appListRouteSchema: FastifySchema = {
  response: {
    200: { items: { $ref: `${MANAGED_APP_RESPONSE_SCHEMA_ID}#` }, type: 'array' },
    401: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  security: [{ developerSession: [] }],
  summary: operations.appList.summary,
  tags: ['Applications'],
};

export const appDeleteRouteSchema: FastifySchema = {
  headers: csrfHeadersSchema,
  params: appIdParamsSchema,
  response: {
    204: { type: 'null' },
    401: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    403: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  security: [{ developerSession: [] }],
  summary: operations.appDelete.summary,
  tags: ['Applications'],
};

export const developerLoginPageRouteSchema: FastifySchema = {
  hide: true,
  querystring: {
    additionalProperties: false,
    properties: { skinError: { enum: ['not-found', 'unavailable'], type: 'string' } },
    type: 'object',
  },
  response: {
    200: htmlResponseSchema,
    303: { type: 'null' },
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerLoginSkinStartRouteSchema: FastifySchema = {
  body: skinVerificationBodySchema,
  hide: true,
  response: {
    303: { type: 'null' },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerLoginSkinDownloadRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: pngResponseSchema,
    303: { type: 'null' },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerLoginSkinStatusRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: verificationStatusSchema,
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    503: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerLoginStatusRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: verificationStatusSchema,
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerLoginCompleteRouteSchema: FastifySchema = {
  hide: true,
  response: {
    303: { type: 'null' },
    403: htmlResponseSchema,
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerDashboardRouteSchema: FastifySchema = {
  hide: true,
  querystring: {
    additionalProperties: false,
    properties: {
      notice: {
        enum: ['invalid-form', 'last-admin', 'not-found'],
        type: 'string',
      },
    },
    type: 'object',
  },
  response: {
    200: htmlResponseSchema,
    303: { type: 'null' },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerAppCreateRouteSchema: FastifySchema = {
  body: {
    additionalProperties: false,
    properties: {
      clientType: { enum: ['public', 'confidential'], type: 'string' },
      csrfToken: csrfFormProperty,
      name: appNameJsonSchema,
      redirectUris: { maxLength: 41_000, minLength: 1, type: 'string' },
    },
    required: ['clientType', 'csrfToken', 'name', 'redirectUris'],
    type: 'object',
  },
  hide: true,
  response: {
    201: htmlResponseSchema,
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    401: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    403: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerAppDeleteRouteSchema: FastifySchema = {
  body: {
    additionalProperties: false,
    properties: { csrfToken: csrfFormProperty },
    required: ['csrfToken'],
    type: 'object',
  },
  hide: true,
  params: appIdParamsSchema,
  response: {
    303: { type: 'null' },
    401: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    403: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerAppDeleteConfirmRouteSchema: FastifySchema = {
  hide: true,
  params: appIdParamsSchema,
  response: {
    200: htmlResponseSchema,
    303: { type: 'null' },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerLogoutRouteSchema: FastifySchema = {
  body: {
    additionalProperties: false,
    properties: { csrfToken: csrfFormProperty },
    required: ['csrfToken'],
    type: 'object',
  },
  hide: true,
  response: {
    303: { type: 'null' },
    401: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    403: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerGrantRouteSchema: FastifySchema = {
  body: {
    additionalProperties: false,
    properties: {
      csrfToken: csrfFormProperty,
      role: developerRoleProperty,
      uuid: { maxLength: 64, minLength: 1, type: 'string' },
    },
    required: ['csrfToken', 'role', 'uuid'],
    type: 'object',
  },
  hide: true,
  response: {
    303: { type: 'null' },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    401: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    403: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerRevokeRouteSchema: FastifySchema = {
  body: {
    additionalProperties: false,
    properties: { csrfToken: csrfFormProperty },
    required: ['csrfToken'],
    type: 'object',
  },
  hide: true,
  params: developerUuidParamsSchema,
  response: {
    303: { type: 'null' },
    401: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    403: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerRevokeConfirmRouteSchema: FastifySchema = {
  hide: true,
  params: developerUuidParamsSchema,
  response: {
    200: htmlResponseSchema,
    303: { type: 'null' },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const developerAssetRouteSchema: FastifySchema = {
  hide: true,
  response: { 200: { type: 'string' } },
};

export const fontAssetRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: { type: 'string' },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const brandIconRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: { type: 'string' },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const backgroundAssetRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: { type: 'string' },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const avatarRouteSchema: FastifySchema = {
  hide: true,
  params: avatarParamsSchema,
  response: {
    200: pngResponseSchema,
    304: { type: 'null' },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    503: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const avatarPreflightRouteSchema: FastifySchema = {
  hide: true,
  params: avatarParamsSchema,
  response: {
    204: { type: 'null' },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const skinRouteSchema: FastifySchema = {
  hide: true,
  params: {
    additionalProperties: false,
    properties: { hash: { pattern: '^[0-9a-f]{64}$', type: 'string' } },
    required: ['hash'],
    type: 'object',
  },
  response: {
    200: pngResponseSchema,
    304: { type: 'null' },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    503: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const rawAvatarRouteSchema: FastifySchema = {
  description: operations.avatarSkin.description,
  params: avatarParamsSchema,
  querystring: emptyQuerySchema,
  response: {
    200: pngResponseSchema,
    304: { type: 'null' },
    400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    503: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.avatarSkin.summary,
  tags: ['Avatars'],
};

export function renderedAvatarRouteSchema(
  operation: 'avatarBody' | 'avatarBust' | 'avatarFace' | 'avatarHead',
): FastifySchema {
  return {
    description: operations[operation].description,
    params: avatarParamsSchema,
    querystring: avatarRenderQuerySchema,
    response: {
      200: pngResponseSchema,
      304: { type: 'null' },
      400: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
      404: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
      429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
      500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
      503: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
      default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    },
    summary: operations[operation].summary,
    tags: ['Avatars'],
  };
}

export const oauthAuthorizationRouteSchema: FastifySchema = {
  description: operations.authorize.description,
  querystring: {
    additionalProperties: false,
    properties: {
      client_id: { type: 'string' },
      code_challenge: { type: 'string' },
      code_challenge_method: { enum: ['S256'], type: 'string' },
      prompt: { type: 'string' },
      redirect_uri: { format: 'uri', type: 'string' },
      response_type: { enum: ['code'], type: 'string' },
      scope: { type: 'string' },
      state: { maxLength: 1_024, minLength: 1, type: 'string' },
    },
    required: [
      'response_type',
      'client_id',
      'redirect_uri',
      'scope',
      'state',
      'code_challenge',
      'code_challenge_method',
    ],
    type: 'object',
  },
  response: {
    302: { type: 'null' },
    303: { type: 'null' },
    400: oauthErrorSchema,
  },
  summary: operations.authorize.summary,
  tags: ['OAuth'],
};

export const oauthResumeRouteSchema: FastifySchema = {
  hide: true,
  params: interactionParamsSchema,
  response: {
    302: { type: 'null' },
    303: { type: 'null' },
    400: oauthErrorSchema,
  },
};

export const oauthTokenRouteSchema: FastifySchema = {
  body: {
    additionalProperties: false,
    properties: {
      client_id: { type: 'string' },
      client_secret: { type: 'string' },
      code: { type: 'string' },
      code_verifier: { type: 'string' },
      grant_type: { enum: ['authorization_code', 'refresh_token'], type: 'string' },
      redirect_uri: { format: 'uri', type: 'string' },
      refresh_token: { type: 'string' },
    },
    required: ['grant_type'],
    type: 'object',
  },
  consumes: ['application/x-www-form-urlencoded'],
  description: operations.token.description,
  response: {
    200: oauthTokenResponseSchema,
    400: oauthErrorSchema,
    401: oauthErrorSchema,
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.token.summary,
  tags: ['OAuth'],
};

export const oauthIntrospectionRouteSchema: FastifySchema = {
  body: {
    additionalProperties: false,
    properties: {
      token: { type: 'string' },
      token_type_hint: { enum: ['access_token', 'refresh_token'], type: 'string' },
    },
    required: ['token'],
    type: 'object',
  },
  consumes: ['application/x-www-form-urlencoded'],
  description: operations.introspection.description,
  response: {
    200: { additionalProperties: true, type: 'object' },
    401: oauthErrorSchema,
    429: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
  summary: operations.introspection.summary,
  tags: ['OAuth'],
};

export const oauthEndSessionRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: { type: 'string' },
    303: { type: 'null' },
    400: oauthErrorSchema,
    500: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const oauthEndSessionConfirmRouteSchema: FastifySchema = {
  body: {
    additionalProperties: true,
    properties: { logout: { type: 'string' }, xsrf: { type: 'string' } },
    type: 'object',
  },
  hide: true,
  response: {
    303: { type: 'null' },
    400: oauthErrorSchema,
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const oauthEndSessionSuccessRouteSchema: FastifySchema = {
  hide: true,
  response: {
    200: { type: 'string' },
    default: { $ref: `${ERROR_RESPONSE_SCHEMA_ID}#` },
  },
};

export const oauthRevocationRouteSchema: FastifySchema = {
  body: {
    additionalProperties: false,
    properties: {
      client_id: { type: 'string' },
      client_secret: { type: 'string' },
      token: { type: 'string' },
      token_type_hint: { enum: ['access_token', 'refresh_token'], type: 'string' },
    },
    required: ['token'],
    type: 'object',
  },
  consumes: ['application/x-www-form-urlencoded'],
  response: {
    200: { type: 'null' },
    400: oauthErrorSchema,
    401: oauthErrorSchema,
  },
  summary: operations.revoke.summary,
  tags: ['OAuth'],
};

export const oauthUserInfoRouteSchema: FastifySchema = {
  description: operations.userInfo.description,
  response: {
    200: { additionalProperties: true, type: 'object' },
    400: oauthErrorSchema,
    401: oauthErrorSchema,
    403: oauthErrorSchema,
  },
  security: [{ bearerAuth: [] }],
  summary: operations.userInfo.summary,
  tags: ['OAuth'],
};

export const oauthJwksRouteSchema: FastifySchema = {
  response: {
    200: {
      additionalProperties: false,
      properties: {
        keys: { items: { additionalProperties: true, type: 'object' }, type: 'array' },
      },
      required: ['keys'],
      type: 'object',
    },
  },
  summary: operations.jwks.summary,
  tags: ['OAuth'],
};

export const oauthDiscoveryRouteSchema: FastifySchema = {
  response: {
    200: { additionalProperties: true, type: 'object' },
  },
  summary: operations.discovery.summary,
  tags: ['OAuth'],
};

export const oauthWebfingerRouteSchema: FastifySchema = {
  querystring: {
    additionalProperties: false,
    properties: {
      rel: { type: 'string' },
      resource: { type: 'string' },
    },
    required: ['resource'],
    type: 'object',
  },
  response: {
    200: { additionalProperties: true, type: 'object' },
    400: oauthErrorSchema,
  },
  summary: operations.webfinger.summary,
  tags: ['OAuth'],
};
