import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import type { AppManager } from '../developers/app-management.js';
import type {
  DeveloperAccessRepository,
  DeveloperRole,
} from '../developers/developer-repository.js';
import { LastAdministratorError } from '../developers/developer-repository.js';
import type { DeveloperLoginService } from '../developers/login-service.js';
import { english } from '../locales/en.js';
import type { AppRegistrar, AppRegistrationInput } from './app-registration.js';
import type { DeveloperAuthentication } from './developer-authentication.js';
import { requestSignal } from './developer-authentication.js';
import { developerStyles } from './developer-assets.js';
import {
  clearDeveloperLoginCookie,
  DEVELOPER_LOGIN_COOKIE,
  readSignedCookie,
  setDeveloperLoginCookie,
  setDeveloperSessionCookie,
} from './developer-cookies.js';
import {
  renderCreatedAppPage,
  renderDeleteAppPage,
  renderDeveloperAccessDeniedPage,
  renderDeveloperDashboard,
  renderDeveloperLoginPage,
  renderRemoveDeveloperPage,
  type DashboardNotice,
  type DeveloperDashboardInput,
} from './developer-pages.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';
import {
  appRegistrationRateLimit,
  developerLoginRateLimit,
  verificationStatusRateLimit,
} from './rate-limit.js';
import {
  developerAppCreateRouteSchema,
  developerAppDeleteConfirmRouteSchema,
  developerAppDeleteRouteSchema,
  developerAssetRouteSchema,
  developerDashboardRouteSchema,
  developerGrantRouteSchema,
  developerLoginCompleteRouteSchema,
  developerLoginPageRouteSchema,
  developerLoginStatusRouteSchema,
  developerLogoutRouteSchema,
  developerRevokeConfirmRouteSchema,
  developerRevokeRouteSchema,
} from './schemas.js';

interface DeveloperAppBody {
  readonly clientType: 'confidential' | 'public';
  readonly csrfToken: string;
  readonly name: string;
  readonly redirectUris: string;
}

interface CsrfBody {
  readonly csrfToken: string;
}

interface AppParams {
  readonly id: string;
}

interface DeveloperGrantBody extends CsrfBody {
  readonly role: DeveloperRole;
  readonly uuid: string;
}

interface DeveloperParams {
  readonly uuid: string;
}

interface DashboardQuery {
  readonly notice?: DashboardNotice;
}

export interface DeveloperRoutesOptions {
  readonly appManager: AppManager;
  readonly apps: AppRegistrar;
  readonly authentication: DeveloperAuthentication;
  readonly developers: DeveloperAccessRepository;
  readonly logins: Pick<DeveloperLoginService, 'complete' | 'start' | 'status'>;
  readonly logger: FastifyBaseLogger;
  readonly minecraftBaseDomain: string;
}

export function registerDeveloperRoutes(
  server: FastifyInstance,
  options: DeveloperRoutesOptions,
): void {
  server.get(
    '/developers/login',
    { config: { rateLimit: developerLoginRateLimit }, schema: developerLoginPageRouteSchema },
    async (request, reply): Promise<void> => {
      if ((await options.authentication.authenticate(request, reply)) !== undefined) {
        await reply.redirect('/developers', 303);
        return;
      }

      const attempt = await options.logins.start(readSignedCookie(request, DEVELOPER_LOGIN_COOKIE));
      setDeveloperLoginCookie(reply, attempt.loginId);
      setDeveloperPageHeaders(reply);
      await reply
        .type('text/html; charset=utf-8')
        .send(renderDeveloperLoginPage(attempt, options.minecraftBaseDomain));
    },
  );

  server.get(
    '/developers/login/status',
    {
      config: { rateLimit: verificationStatusRateLimit },
      schema: developerLoginStatusRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const loginId = readSignedCookie(request, DEVELOPER_LOGIN_COOKIE);
      void reply.header('cache-control', 'no-store');
      if (loginId === undefined) {
        await reply.send({ status: 'expired' });
        return;
      }
      const status = await options.logins.status(loginId);
      await reply.send({ status: status.status });
    },
  );

  server.post(
    '/developers/login/complete',
    { schema: developerLoginCompleteRouteSchema },
    async (request, reply): Promise<void> => {
      const loginId = readSignedCookie(request, DEVELOPER_LOGIN_COOKIE);
      if (loginId === undefined) {
        await reply.redirect('/developers/login', 303);
        return;
      }

      const completion = await options.logins.complete(loginId, requestSignal(request));
      if (completion.status === 'pending') {
        await reply.redirect('/developers/login', 303);
        return;
      }
      if (completion.status === 'expired') {
        clearDeveloperLoginCookie(reply);
        await reply.redirect('/developers/login', 303);
        return;
      }
      if (completion.status === 'denied') {
        clearDeveloperLoginCookie(reply);
        setDeveloperPageHeaders(reply);
        await reply
          .status(403)
          .type('text/html; charset=utf-8')
          .send(renderDeveloperAccessDeniedPage());
        return;
      }

      clearDeveloperLoginCookie(reply);
      setDeveloperSessionCookie(
        reply,
        completion.session.sessionId,
        completion.session.expiresInSeconds,
      );
      await reply.redirect('/developers', 303);
    },
  );

  server.get<{ Querystring: DashboardQuery }>(
    '/developers',
    { schema: developerDashboardRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      const [apps, developers] = await Promise.all([
        options.appManager.list(session.userUuid, session.role),
        session.role === 'admin' ? options.developers.list() : Promise.resolve(undefined),
      ]);
      const dashboard: DeveloperDashboardInput = {
        apps,
        csrfToken: session.csrfToken,
        role: session.role,
        userUuid: session.userUuid,
        ...(developers === undefined ? {} : { developers }),
        ...(request.query.notice === undefined ? {} : { notice: request.query.notice }),
      };
      setDeveloperPageHeaders(reply);
      await reply.type('text/html; charset=utf-8').send(renderDeveloperDashboard(dashboard));
    },
  );

  server.get<{ Params: AppParams }>(
    '/developers/apps/:id/delete',
    { schema: developerAppDeleteConfirmRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      const apps = await options.appManager.list(session.userUuid, session.role);
      const app = apps.find((candidate): boolean => candidate.id === request.params.id);
      if (app === undefined) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      setDeveloperPageHeaders(reply);
      await reply
        .type('text/html; charset=utf-8')
        .send(renderDeleteAppPage(app, session.csrfToken));
    },
  );

  server.post<{ Body: DeveloperAppBody }>(
    '/developers/apps',
    {
      attachValidation: true,
      config: { rateLimit: { ...appRegistrationRateLimit, groupId: 'developer-app-create' } },
      schema: developerAppCreateRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, readStringField(request.body, 'csrfToken'));
      if (request.validationError !== undefined) {
        await renderDashboardError(options, reply, session, readAppFormValues(request.body));
        return;
      }

      const input: AppRegistrationInput = {
        clientType: request.body.clientType,
        name: request.body.name,
        redirectUris: parseRedirectUriLines(request.body.redirectUris),
      };
      try {
        const app = await options.apps.register(input, session.userUuid);
        setDeveloperPageHeaders(reply);
        await reply.status(201).type('text/html; charset=utf-8').send(renderCreatedAppPage(app));
      } catch (error: unknown) {
        if (!(error instanceof ZodError)) {
          throw error;
        }
        await renderDashboardError(options, reply, session, readAppFormValues(request.body));
      }
    },
  );

  server.post<{ Body: CsrfBody; Params: AppParams }>(
    '/developers/apps/:id/delete',
    { schema: developerAppDeleteRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, request.body.csrfToken);
      if (!(await options.appManager.remove(request.params.id, session.userUuid, session.role))) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      options.logger.info(
        { actorUuid: session.userUuid, appId: request.params.id },
        'Developer deleted an OAuth application',
      );
      await reply.redirect('/developers', 303);
    },
  );

  server.post<{ Body: CsrfBody }>(
    '/developers/logout',
    { schema: developerLogoutRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, request.body.csrfToken);
      await options.authentication.logout(session, reply);
      await reply.redirect('/', 303);
    },
  );

  server.post<{ Body: DeveloperGrantBody }>(
    '/developers/admin/developers',
    { attachValidation: true, schema: developerGrantRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireAdministrator(session);
      options.authentication.requireCsrf(session, readStringField(request.body, 'csrfToken'));
      if (request.validationError !== undefined) {
        await reply.redirect('/developers?notice=invalid-form', 303);
        return;
      }
      try {
        const access = await options.developers.grant(
          request.body.uuid.toLowerCase(),
          request.body.role,
        );
        options.logger.info(
          { actorUuid: session.userUuid, developerRole: access.role, developerUuid: access.uuid },
          'Administrator changed developer access',
        );
        await reply.redirect('/developers', 303);
      } catch (error: unknown) {
        if (error instanceof LastAdministratorError) {
          await reply.redirect('/developers?notice=last-admin', 303);
          return;
        }
        throw error;
      }
    },
  );

  server.get<{ Params: DeveloperParams }>(
    '/developers/admin/developers/:uuid/delete',
    { schema: developerRevokeConfirmRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireAdministrator(session);
      const developers = await options.developers.list();
      const developer = developers.find(
        (candidate): boolean => candidate.uuid === request.params.uuid.toLowerCase(),
      );
      if (developer === undefined) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      setDeveloperPageHeaders(reply);
      await reply
        .type('text/html; charset=utf-8')
        .send(renderRemoveDeveloperPage(developer, session.csrfToken));
    },
  );

  server.post<{ Body: CsrfBody; Params: DeveloperParams }>(
    '/developers/admin/developers/:uuid/delete',
    { schema: developerRevokeRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, request.body.csrfToken);
      options.authentication.requireAdministrator(session);
      try {
        if (!(await options.developers.revoke(request.params.uuid.toLowerCase()))) {
          await reply.redirect('/developers?notice=not-found', 303);
          return;
        }
        options.logger.info(
          { actorUuid: session.userUuid, developerUuid: request.params.uuid.toLowerCase() },
          'Administrator revoked developer access',
        );
        await reply.redirect('/developers', 303);
      } catch (error: unknown) {
        if (error instanceof LastAdministratorError) {
          await reply.redirect('/developers?notice=last-admin', 303);
          return;
        }
        throw error;
      }
    },
  );

  server.get(
    '/assets/developer.css',
    { schema: developerAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=3600');
      await reply.type('text/css; charset=utf-8').send(developerStyles);
    },
  );
}

async function requireSession(
  authentication: DeveloperAuthentication,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Awaited<ReturnType<DeveloperAuthentication['authenticate']>>> {
  const session = await authentication.authenticate(request, reply);
  if (session === undefined) {
    await reply.redirect('/developers/login', 303);
  }
  return session;
}

async function renderDashboardError(
  options: DeveloperRoutesOptions,
  reply: FastifyReply,
  session: NonNullable<Awaited<ReturnType<DeveloperAuthentication['authenticate']>>>,
  values: NonNullable<DeveloperDashboardInput['formValues']>,
): Promise<void> {
  const [apps, developers] = await Promise.all([
    options.appManager.list(session.userUuid, session.role),
    session.role === 'admin' ? options.developers.list() : Promise.resolve(undefined),
  ]);
  const dashboard: DeveloperDashboardInput = {
    apps,
    csrfToken: session.csrfToken,
    formError: english.developer.app.formErrorNotice,
    formValues: values,
    role: session.role,
    userUuid: session.userUuid,
    ...(developers === undefined ? {} : { developers }),
  };
  setDeveloperPageHeaders(reply);
  await reply
    .status(400)
    .type('text/html; charset=utf-8')
    .send(renderDeveloperDashboard(dashboard));
}

function parseRedirectUriLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line): string => line.trim())
    .filter((line): boolean => line.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringField(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function readAppFormValues(source: unknown): NonNullable<DeveloperDashboardInput['formValues']> {
  return {
    clientType:
      readStringField(source, 'clientType') === 'confidential' ? 'confidential' : 'public',
    name: readStringField(source, 'name') ?? '',
    redirectUris: readStringField(source, 'redirectUris') ?? '',
  };
}

function setDeveloperPageHeaders(reply: FastifyReply): void {
  void reply.headers({
    'cache-control': 'no-store',
    'content-security-policy': PAGE_CONTENT_SECURITY_POLICY,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
}
