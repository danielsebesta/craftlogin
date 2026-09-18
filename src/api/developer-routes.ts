import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import {
  appVerificationDecisionSchema,
  appVerificationNoteSchema,
  type AppManager,
  type AppVerificationDecision,
} from '../developers/app-management.js';
import type {
  DeveloperAccessRepository,
  DeveloperRole,
} from '../developers/developer-repository.js';
import {
  developerUuidSchema,
  developerVerificationDecisionSchema,
  LastAdministratorError,
} from '../developers/developer-repository.js';
import type { DeveloperSessionService } from '../developers/session-service.js';
import { ApiError } from './errors.js';
import { resolveDeveloperIdentifier } from '../developers/developer-identifier.js';
import type { MinecraftPlayerLookup } from '../mojang/client.js';
import { english } from '../locales/en.js';
import type { AppRegistrar, AppRegistrationInput } from './app-registration.js';
import type { CurrentUser, CurrentUserLookup } from './current-user.js';
import type { DeveloperAuthentication } from './developer-authentication.js';
import { requestSignal } from './developer-authentication.js';
import { developerStyles } from './developer-assets.js';
import {
  clearConsoleOAuthCookie,
  readConsoleOAuthCookie,
  setConsoleOAuthCookie,
  setDeveloperSessionCookie,
} from './developer-cookies.js';
import {
  consoleAuthorizeUrl,
  consoleStatesEqual,
  createConsoleOidcTransaction,
  exchangeConsoleCode,
  fetchConsoleSubject,
  ConsoleOidcError,
} from './developer-oidc-login.js';
import {
  renderCreatedAppPage,
  renderDeleteAppPage,
  renderDeveloperAccessDeniedPage,
  renderDeveloperDashboard,
  renderRemoveDeveloperPage,
  renderRequestVerificationPage,
  type DashboardNotice,
  type DeveloperDashboardInput,
} from './developer-pages.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';
import {
  appRegistrationRateLimit,
  developerAppVerificationRateLimit,
  developerLoginPageRateLimit,
} from './rate-limit.js';
import {
  developerAppCreateRouteSchema,
  developerAppDeleteConfirmRouteSchema,
  developerAppDeleteRouteSchema,
  developerAppVerificationDecisionRouteSchema,
  developerAppVerificationRequestRouteSchema,
  developerAppVerificationRouteSchema,
  developerAssetRouteSchema,
  developerCallbackRouteSchema,
  developerDashboardRouteSchema,
  developerGrantRouteSchema,
  developerLoginPageRouteSchema,
  developerLogoutRouteSchema,
  developerRevokeConfirmRouteSchema,
  developerRevokeRouteSchema,
  developerVerificationDecisionRouteSchema,
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

const APP_VERIFICATION_NOTICES = {
  approve: 'verification-approved',
  reject: 'verification-rejected',
  revoke: 'verification-revoked',
} satisfies Record<AppVerificationDecision, DashboardNotice>;

interface DeveloperGrantBody extends CsrfBody {
  readonly role: DeveloperRole;
  readonly uuid: string;
}

interface AppVerificationRequestBody extends CsrfBody {
  readonly note?: string;
}

interface VerificationDecisionBody extends CsrfBody {
  readonly decision: string;
}

interface DeveloperParams {
  readonly uuid: string;
}

interface DashboardQuery {
  readonly notice?: DashboardNotice;
}

interface DeveloperCallbackQuery {
  readonly code?: string;
  readonly error?: string;
  readonly error_description?: string;
  readonly iss?: string;
  readonly state?: string;
}

export interface DeveloperRoutesOptions {
  readonly appManager: AppManager;
  readonly apps: AppRegistrar;
  readonly authentication: DeveloperAuthentication;
  readonly consoleClient: { readonly clientId: string };
  readonly developers: DeveloperAccessRepository;
  readonly fetchImplementation?: typeof fetch;
  readonly httpPort: number;
  readonly issuer: string;
  readonly logger: FastifyBaseLogger;
  readonly players?: MinecraftPlayerLookup;
  readonly sessions: Pick<DeveloperSessionService, 'create'>;
  readonly users: CurrentUserLookup;
}

export function registerDeveloperRoutes(
  server: FastifyInstance,
  options: DeveloperRoutesOptions,
): void {
  // The console authenticates exactly like any other OAuth client: the login
  // redirects to the standard authorization endpoint, the player verifies on
  // the shared interaction page, and this callback consumes the resulting
  // code. Token exchange and userinfo run against the loopback listener so no
  // TLS trust is needed for the server-to-server calls.
  const redirectUri = `${options.issuer}/developers/callback`;
  const oidcEndpoints = {
    authorizationEndpoint: `${options.issuer}/oauth2/authorize`,
    clientId: options.consoleClient.clientId,
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    redirectUri,
    tokenEndpoint: `http://127.0.0.1:${options.httpPort.toString()}/oauth2/token`,
    userInfoEndpoint: `http://127.0.0.1:${options.httpPort.toString()}/oauth2/userinfo`,
  };

  server.get(
    '/developers/login',
    { config: { rateLimit: developerLoginPageRateLimit }, schema: developerLoginPageRouteSchema },
    async (request, reply): Promise<void> => {
      if ((await options.authentication.authenticate(request, reply)) !== undefined) {
        await reply.redirect('/developers', 303);
        return;
      }
      const transaction = createConsoleOidcTransaction();
      setConsoleOAuthCookie(reply, { state: transaction.state, verifier: transaction.verifier });
      await reply.redirect(
        consoleAuthorizeUrl(oidcEndpoints, transaction.state, transaction.challenge),
        303,
      );
    },
  );

  server.get<{ Querystring: DeveloperCallbackQuery }>(
    '/developers/callback',
    { schema: developerCallbackRouteSchema },
    async (request, reply): Promise<void> => {
      const stored = readConsoleOAuthCookie(request);
      clearConsoleOAuthCookie(reply);
      const { code, error, iss, state } = request.query;
      if (
        error !== undefined ||
        (iss !== undefined && iss !== options.issuer) ||
        stored === undefined ||
        state === undefined ||
        code === undefined ||
        !consoleStatesEqual(stored.state, state)
      ) {
        await reply.redirect('/developers/login', 303);
        return;
      }
      try {
        const accessToken = await exchangeConsoleCode(oidcEndpoints, code, stored.verifier);
        const subject = await fetchConsoleSubject(oidcEndpoints, accessToken);
        const parsedUuid = developerUuidSchema.safeParse(subject);
        if (!parsedUuid.success) {
          throw new ConsoleOidcError('Console userinfo returned an invalid subject');
        }
        const access = await options.developers.find(parsedUuid.data);
        if (access === undefined) {
          setDeveloperPageHeaders(reply);
          await reply
            .status(403)
            .type('text/html; charset=utf-8')
            .send(renderDeveloperAccessDeniedPage());
          return;
        }
        const session = await options.sessions.create(
          parsedUuid.data,
          access.role,
          requestSignal(request),
        );
        setDeveloperSessionCookie(reply, session.sessionId, session.expiresInSeconds);
        await reply.redirect('/developers', 303);
      } catch {
        // The access token stays server-side and is never logged; a fresh
        // login attempt is the safe recovery for every callback failure.
        options.logger.warn('Developer Console OIDC callback failed');
        await reply.redirect('/developers/login', 303);
      }
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
      const [apps, developers, user] = await Promise.all([
        options.appManager.list(session.userUuid, session.role),
        session.role === 'admin' ? options.developers.list() : Promise.resolve(undefined),
        options.users.findCurrentUser(session.userUuid),
      ]);
      const dashboard: DeveloperDashboardInput = {
        apps,
        csrfToken: session.csrfToken,
        role: session.role,
        username: requireDashboardUser(user, session.userUuid).username,
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

  server.get<{ Params: AppParams }>(
    '/developers/apps/:id/verification',
    { schema: developerAppVerificationRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      const apps = await options.appManager.list(session.userUuid, session.role);
      const app = apps.find((candidate): boolean => candidate.id === request.params.id);
      if (app?.verification !== 'none') {
        await reply.redirect('/developers?notice=verification-unavailable', 303);
        return;
      }
      setDeveloperPageHeaders(reply);
      await reply
        .type('text/html; charset=utf-8')
        .send(renderRequestVerificationPage(app, session.csrfToken));
    },
  );

  server.post<{ Body: AppVerificationRequestBody; Params: AppParams }>(
    '/developers/apps/:id/verification',
    {
      attachValidation: true,
      config: { rateLimit: developerAppVerificationRateLimit },
      schema: developerAppVerificationRequestRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, readStringField(request.body, 'csrfToken'));
      if (request.validationError !== undefined) {
        await reply.redirect('/developers?notice=invalid-form', 303);
        return;
      }
      // The note is optional free text: trailing whitespace from a textarea is
      // formatting, not content, so trim it and treat the result as absent.
      const note = (readStringField(request.body, 'note') ?? '').trim();
      const parsedNote = note.length === 0 ? undefined : appVerificationNoteSchema.safeParse(note);
      if (parsedNote !== undefined && !parsedNote.success) {
        await reply.redirect('/developers?notice=invalid-form', 303);
        return;
      }
      const outcome = await options.appManager.requestVerification(
        request.params.id,
        session.userUuid,
        parsedNote?.data,
      );
      if (outcome !== 'applied') {
        await reply.redirect('/developers?notice=verification-unavailable', 303);
        return;
      }
      options.logger.info(
        { actorUuid: session.userUuid, appId: request.params.id },
        'Developer requested application verification',
      );
      await reply.redirect('/developers?notice=verification-requested', 303);
    },
  );

  server.post<{ Body: VerificationDecisionBody; Params: AppParams }>(
    '/developers/admin/apps/:id/verification',
    { attachValidation: true, schema: developerAppVerificationDecisionRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, readStringField(request.body, 'csrfToken'));
      options.authentication.requireAdministrator(session);
      const decision = appVerificationDecisionSchema.safeParse(
        readStringField(request.body, 'decision'),
      );
      if (request.validationError !== undefined || !decision.success) {
        await reply.redirect('/developers?notice=invalid-form', 303);
        return;
      }
      const outcome = await options.appManager.decideVerification(request.params.id, decision.data);
      if (outcome !== 'applied') {
        await reply.redirect('/developers?notice=verification-unavailable', 303);
        return;
      }
      options.logger.info(
        { actorUuid: session.userUuid, appId: request.params.id, decision: decision.data },
        'Administrator changed application verification',
      );
      await reply.redirect(`/developers?notice=${APP_VERIFICATION_NOTICES[decision.data]}`, 303);
    },
  );

  server.post<{ Body: VerificationDecisionBody; Params: DeveloperParams }>(
    '/developers/admin/developers/:uuid/verification',
    { attachValidation: true, schema: developerVerificationDecisionRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, readStringField(request.body, 'csrfToken'));
      options.authentication.requireAdministrator(session);
      const decision = developerVerificationDecisionSchema.safeParse(
        readStringField(request.body, 'decision'),
      );
      if (request.validationError !== undefined || !decision.success) {
        await reply.redirect('/developers?notice=invalid-form', 303);
        return;
      }
      const developerUuid = request.params.uuid.toLowerCase();
      const updated = await options.developers.setVerified(
        developerUuid,
        decision.data === 'verify',
      );
      if (!updated) {
        await reply.redirect('/developers?notice=verification-unavailable', 303);
        return;
      }
      options.logger.info(
        { actorUuid: session.userUuid, decision: decision.data, developerUuid },
        'Administrator changed developer verification',
      );
      await reply.redirect(
        `/developers?notice=${decision.data === 'verify' ? 'developer-verified' : 'developer-unverified'}`,
        303,
      );
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
      const uuid = await resolveDeveloperIdentifier(request.body.uuid.trim(), options.players);
      if (uuid === undefined) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      try {
        const access = await options.developers.grant(uuid, request.body.role);
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
      void reply.header('cache-control', 'public, max-age=0, must-revalidate');
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
  const [apps, developers, user] = await Promise.all([
    options.appManager.list(session.userUuid, session.role),
    session.role === 'admin' ? options.developers.list() : Promise.resolve(undefined),
    options.users.findCurrentUser(session.userUuid),
  ]);
  const dashboard: DeveloperDashboardInput = {
    apps,
    csrfToken: session.csrfToken,
    formError: english.developer.app.formErrorNotice,
    formValues: values,
    role: session.role,
    username: requireDashboardUser(user, session.userUuid).username,
    userUuid: session.userUuid,
    ...(developers === undefined ? {} : { developers }),
  };
  setDeveloperPageHeaders(reply);
  await reply
    .status(400)
    .type('text/html; charset=utf-8')
    .send(renderDeveloperDashboard(dashboard));
}

function requireDashboardUser(user: CurrentUser | undefined, expectedUuid: string): CurrentUser {
  if (user?.uuid !== expectedUuid) {
    throw new ApiError(500, 'internal_error', english.api.errors.internal);
  }
  return user;
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
