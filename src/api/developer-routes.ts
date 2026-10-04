import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import {
  appVerificationDecisionSchema,
  appVerificationNoteSchema,
  type AppManager,
  type AppVerificationDecision,
  type ManagedApp,
} from '../developers/app-management.js';
import {
  AppIconError,
  normalizeAppIcon,
  type AppIconErrorCode,
  type NormalizedAppIcon,
} from '../developers/app-icon.js';
import type {
  DeveloperAccessRepository,
  DeveloperRole,
} from '../developers/developer-repository.js';
import {
  developerUuidSchema,
  developerVerificationDecisionSchema,
  LastAdministratorError,
  OwnerAccessError,
} from '../developers/developer-repository.js';
import type {
  DeveloperRequestSignal,
  DeveloperSessionService,
} from '../developers/session-service.js';
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
  renderAppIconPage,
  renderAppRedirectsPage,
  renderAppSecretPage,
  renderAppSecretResetPage,
  renderCreatedAppPage,
  renderDeleteAppPage,
  renderDeveloperAccessDeniedPage,
  renderDeveloperDashboard,
  renderRemoveDeveloperPage,
  renderRequestVerificationPage,
  type AppIconNotice,
  type AppIconPageInput,
  type AppRedirectsNotice,
  type AppRedirectsPageInput,
  type DashboardNotice,
  type DeveloperDashboardInput,
} from './developer-pages.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';
import {
  appIconWriteRateLimit,
  appRegistrationRateLimit,
  developerAppUpdateRateLimit,
  developerAppVerificationRateLimit,
  developerLoginPageRateLimit,
} from './rate-limit.js';
import {
  developerAppCreateRouteSchema,
  developerAppDeleteConfirmRouteSchema,
  developerAppDeleteRouteSchema,
  developerAppIconDeleteRouteSchema,
  developerAppIconRouteSchema,
  developerAppIconUploadRouteSchema,
  developerAppRedirectsRouteSchema,
  developerAppRedirectsUpdateRouteSchema,
  developerAppSecretResetRouteSchema,
  developerAppSecretRouteSchema,
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
  developerSessionRevokeRouteSchema,
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

interface RedirectUrisBody extends CsrfBody {
  readonly redirectUris: string;
}

interface SessionRevokeBody extends CsrfBody {
  readonly sessionKey: string;
}

interface AppParams {
  readonly id: string;
}

type DeveloperSession = NonNullable<Awaited<ReturnType<DeveloperAuthentication['authenticate']>>>;

const ICON_ERROR_MESSAGES: Record<AppIconErrorCode, string> = {
  'invalid-image': english.developer.app.iconErrors.invalidImage,
  'not-png': english.developer.app.iconErrors.notPng,
  'too-large-bytes': english.developer.app.iconErrors.tooLargeBytes,
  'too-large-dimensions': english.developer.app.iconErrors.tooLargeDimensions,
};

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
  readonly ownerUuid?: string;
  readonly players?: MinecraftPlayerLookup;
  readonly sessions: Pick<DeveloperSessionService, 'create' | 'list' | 'revokeByKeyId'>;
  readonly showDocumentation: boolean;
  readonly users: CurrentUserLookup;
}

export function registerDeveloperRoutes(
  server: FastifyInstance,
  options: DeveloperRoutesOptions,
): void {
  // The console authenticates like any other OAuth client; token exchange and
  // userinfo hit the loopback listener so no TLS trust is needed server-to-server.
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
        // The access token stays server-side and unlogged; a fresh login is
        // the safe recovery for every callback failure.
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
      const [apps, developers, user, sessions] = await Promise.all([
        options.appManager.list(session.userUuid, session.role),
        session.role === 'admin' ? options.developers.list() : Promise.resolve(undefined),
        options.users.findCurrentUser(session.userUuid),
        options.sessions.list(session.userUuid, session.sessionId, requestSignal(request)),
      ]);
      const ownerUuids = apps
        .map((app): string | undefined => app.ownerUuid)
        .filter((uuid): uuid is string => uuid !== undefined);
      const playerNames = await resolvePlayerNicknames(
        ownerUuids,
        options.users,
        options.players,
        user,
      );
      const dashboard: DeveloperDashboardInput = {
        apps,
        csrfToken: session.csrfToken,
        ...(options.ownerUuid === undefined ? {} : { ownerUuid: options.ownerUuid }),
        playerNames,
        role: session.role,
        sessions,
        showDocumentation: options.showDocumentation,
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
        await renderDashboardError(
          options,
          reply,
          session,
          readAppFormValues(request.body),
          requestSignal(request),
        );
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
        await renderDashboardError(
          options,
          reply,
          session,
          readAppFormValues(request.body),
          requestSignal(request),
        );
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
        {
          actorUuid: session.userUuid,
          appId: request.params.id,
          audit: true,
          event: 'developer_app_deleted',
        },
        'Developer deleted an OAuth application',
      );
      await reply.redirect('/developers', 303);
    },
  );

  server.get<{ Params: AppParams; Querystring: { notice?: AppIconNotice } }>(
    '/developers/apps/:id/icon',
    { schema: developerAppIconRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      const app = await findManagedApp(options, session, request.params.id);
      if (app === undefined) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      await sendAppIconPage(reply, app, session.csrfToken, {
        ...(request.query.notice === undefined ? {} : { notice: request.query.notice }),
      });
    },
  );

  server.post<{ Params: AppParams }>(
    '/developers/apps/:id/icon',
    {
      config: { rateLimit: appIconWriteRateLimit },
      schema: developerAppIconUploadRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      // The CSRF token travels as a multipart field so the form works without JavaScript.
      const upload = await readIconUpload(request);
      options.authentication.requireCsrf(session, upload.csrfToken);
      const app = await findManagedApp(options, session, request.params.id);
      if (app === undefined) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      if (upload.tooLarge) {
        await sendAppIconPage(reply, app, session.csrfToken, {
          error: ICON_ERROR_MESSAGES['too-large-bytes'],
          statusCode: 413,
        });
        return;
      }
      if (upload.bytes === undefined) {
        await sendAppIconPage(reply, app, session.csrfToken, {
          error: english.developer.app.iconErrors.missingFile,
          statusCode: 400,
        });
        return;
      }

      let icon: NormalizedAppIcon;
      try {
        icon = await normalizeAppIcon(upload.bytes);
      } catch (error: unknown) {
        if (!(error instanceof AppIconError)) {
          throw error;
        }
        await sendAppIconPage(reply, app, session.csrfToken, {
          error: ICON_ERROR_MESSAGES[error.code],
          statusCode: 400,
        });
        return;
      }

      if (
        !(await options.appManager.setIcon(request.params.id, session.userUuid, session.role, icon))
      ) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      options.logger.info(
        {
          actorUuid: session.userUuid,
          appId: request.params.id,
          audit: true,
          event: 'developer_app_icon_updated',
        },
        'Developer updated an application icon',
      );
      await reply.redirect(
        `/developers/apps/${encodeURIComponent(request.params.id)}/icon?notice=icon-saved`,
        303,
      );
    },
  );

  server.post<{ Body: CsrfBody; Params: AppParams }>(
    '/developers/apps/:id/icon/delete',
    { schema: developerAppIconDeleteRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, request.body.csrfToken);
      if (
        !(await options.appManager.removeIcon(request.params.id, session.userUuid, session.role))
      ) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      options.logger.info(
        {
          actorUuid: session.userUuid,
          appId: request.params.id,
          audit: true,
          event: 'developer_app_icon_removed',
        },
        'Developer removed an application icon',
      );
      await reply.redirect(
        `/developers/apps/${encodeURIComponent(request.params.id)}/icon?notice=icon-removed`,
        303,
      );
    },
  );

  server.get<{ Params: AppParams; Querystring: { notice?: AppRedirectsNotice } }>(
    '/developers/apps/:id/redirects',
    { schema: developerAppRedirectsRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      const app = await findManagedApp(options, session, request.params.id);
      if (app === undefined) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      await sendAppRedirectsPage(reply, app, session.csrfToken, {
        ...(request.query.notice === undefined ? {} : { notice: request.query.notice }),
      });
    },
  );

  server.post<{ Body: RedirectUrisBody; Params: AppParams }>(
    '/developers/apps/:id/redirects',
    {
      attachValidation: true,
      config: { rateLimit: developerAppUpdateRateLimit },
      schema: developerAppRedirectsUpdateRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, readStringField(request.body, 'csrfToken'));
      const app = await findManagedApp(options, session, request.params.id);
      if (app === undefined) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      const submitted = readStringField(request.body, 'redirectUris') ?? '';
      if (request.validationError !== undefined) {
        await sendAppRedirectsPage(reply, app, session.csrfToken, {
          error: english.developer.app.redirectsFormError,
          statusCode: 400,
          values: submitted,
        });
        return;
      }
      try {
        if (
          !(await options.appManager.updateRedirectUris(
            request.params.id,
            session.userUuid,
            session.role,
            parseRedirectUriLines(submitted),
          ))
        ) {
          await reply.redirect('/developers?notice=not-found', 303);
          return;
        }
      } catch (error: unknown) {
        if (!(error instanceof ZodError)) {
          throw error;
        }
        await sendAppRedirectsPage(reply, app, session.csrfToken, {
          error: english.developer.app.redirectsFormError,
          statusCode: 400,
          values: submitted,
        });
        return;
      }
      options.logger.info(
        {
          actorUuid: session.userUuid,
          appId: request.params.id,
          audit: true,
          event: 'developer_app_redirects_updated',
        },
        'Developer updated application redirect URIs',
      );
      await reply.redirect(
        `/developers/apps/${encodeURIComponent(request.params.id)}/redirects?notice=redirects-saved`,
        303,
      );
    },
  );

  server.get<{ Params: AppParams }>(
    '/developers/apps/:id/secret',
    { schema: developerAppSecretRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      const app = await findManagedApp(options, session, request.params.id);
      if (app === undefined) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      if (app.clientType !== 'confidential') {
        await reply.redirect('/developers?notice=secret-unavailable', 303);
        return;
      }
      setDeveloperPageHeaders(reply);
      await reply
        .type('text/html; charset=utf-8')
        .send(renderAppSecretPage(app, session.csrfToken));
    },
  );

  server.post<{ Body: CsrfBody; Params: AppParams }>(
    '/developers/apps/:id/secret/reset',
    {
      config: { rateLimit: developerAppUpdateRateLimit },
      schema: developerAppSecretResetRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, request.body.csrfToken);
      const app = await findManagedApp(options, session, request.params.id);
      if (app === undefined) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      const clientSecret = await options.appManager.resetSecret(
        request.params.id,
        session.userUuid,
        session.role,
      );
      if (clientSecret === undefined) {
        await reply.redirect('/developers?notice=secret-unavailable', 303);
        return;
      }
      options.logger.info(
        {
          actorUuid: session.userUuid,
          appId: request.params.id,
          audit: true,
          event: 'developer_app_secret_reset',
        },
        'Developer rotated an application client secret',
      );
      setDeveloperPageHeaders(reply);
      await reply
        .type('text/html; charset=utf-8')
        .send(renderAppSecretResetPage(app, clientSecret));
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
      // Textarea whitespace is formatting, not content.
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
        {
          actorUuid: session.userUuid,
          appId: request.params.id,
          audit: true,
          event: 'developer_app_verification_requested',
        },
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
        {
          actorUuid: session.userUuid,
          appId: request.params.id,
          audit: true,
          decision: decision.data,
          event: 'admin_app_verification_decided',
        },
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
        {
          actorUuid: session.userUuid,
          audit: true,
          decision: decision.data,
          developerUuid,
          event: 'admin_developer_verification_decided',
        },
        'Administrator changed developer verification',
      );
      await reply.redirect(
        `/developers?notice=${decision.data === 'verify' ? 'developer-verified' : 'developer-unverified'}`,
        303,
      );
    },
  );

  server.post<{ Body: SessionRevokeBody }>(
    '/developers/sessions/revoke',
    { schema: developerSessionRevokeRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await requireSession(options.authentication, request, reply);
      if (session === undefined) {
        return;
      }
      options.authentication.requireCsrf(session, request.body.csrfToken);
      // The service scopes revocation to sessions in the caller's own index,
      // so a foreign key ID is a no-op rather than an information leak.
      const revoked = await options.sessions.revokeByKeyId(
        session.userUuid,
        request.body.sessionKey,
      );
      if (!revoked) {
        await reply.redirect('/developers?notice=not-found', 303);
        return;
      }
      options.logger.info(
        {
          actorUuid: session.userUuid,
          audit: true,
          event: 'developer_session_revoked',
          sessionKeyId: request.body.sessionKey,
        },
        'Developer revoked a console session',
      );
      await reply.redirect('/developers?notice=session-revoked', 303);
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
          {
            actorUuid: session.userUuid,
            audit: true,
            developerRole: access.role,
            developerUuid: access.uuid,
            event: 'admin_developer_access_changed',
          },
          'Administrator changed developer access',
        );
        await reply.redirect('/developers', 303);
      } catch (error: unknown) {
        if (error instanceof LastAdministratorError) {
          await reply.redirect('/developers?notice=last-admin', 303);
          return;
        }
        if (error instanceof OwnerAccessError) {
          await reply.redirect('/developers?notice=owner-protected', 303);
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
          {
            actorUuid: session.userUuid,
            audit: true,
            developerUuid: request.params.uuid.toLowerCase(),
            event: 'admin_developer_access_revoked',
          },
          'Administrator revoked developer access',
        );
        await reply.redirect('/developers', 303);
      } catch (error: unknown) {
        if (error instanceof LastAdministratorError) {
          await reply.redirect('/developers?notice=last-admin', 303);
          return;
        }
        if (error instanceof OwnerAccessError) {
          await reply.redirect('/developers?notice=owner-protected', 303);
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
  signal: DeveloperRequestSignal,
): Promise<void> {
  const [apps, developers, user, sessions] = await Promise.all([
    options.appManager.list(session.userUuid, session.role),
    session.role === 'admin' ? options.developers.list() : Promise.resolve(undefined),
    options.users.findCurrentUser(session.userUuid),
    options.sessions.list(session.userUuid, session.sessionId, signal),
  ]);
  const ownerUuids = apps
    .map((app): string | undefined => app.ownerUuid)
    .filter((uuid): uuid is string => uuid !== undefined);
  const playerNames = await resolvePlayerNicknames(
    ownerUuids,
    options.users,
    options.players,
    user,
  );
  const dashboard: DeveloperDashboardInput = {
    apps,
    csrfToken: session.csrfToken,
    formError: english.developer.app.formErrorNotice,
    formValues: values,
    playerNames,
    role: session.role,
    sessions,
    showDocumentation: options.showDocumentation,
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

async function resolvePlayerNicknames(
  uuids: readonly string[],
  users: CurrentUserLookup,
  players?: MinecraftPlayerLookup,
  currentUser?: CurrentUser,
): Promise<Record<string, string>> {
  const uniqueUuids = [...new Set(uuids)];
  const results: Record<string, string> = {};

  if (currentUser !== undefined && currentUser.username.length > 0) {
    results[currentUser.uuid] = currentUser.username;
  }

  await Promise.all(
    uniqueUuids.map(async (uuid): Promise<void> => {
      if (players !== undefined) {
        try {
          const profile = await players.findProfileById(uuid);
          if (profile?.username) {
            results[uuid] = profile.username;
            return;
          }
        } catch {
          // Fall back to the database record.
        }
      }
      if (results[uuid] === undefined) {
        try {
          const stored = await users.findCurrentUser(uuid);
          if (stored?.username) {
            results[uuid] = stored.username;
          }
        } catch {
          // A missing record just leaves the UUID unresolved.
        }
      }
    }),
  );

  return results;
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

async function findManagedApp(
  options: DeveloperRoutesOptions,
  session: DeveloperSession,
  appId: string,
): Promise<ManagedApp | undefined> {
  const apps = await options.appManager.list(session.userUuid, session.role);
  return apps.find((candidate): boolean => candidate.id === appId);
}

async function sendAppIconPage(
  reply: FastifyReply,
  app: ManagedApp,
  csrfToken: string,
  input: AppIconPageInput,
): Promise<void> {
  setDeveloperPageHeaders(reply);
  await reply
    .status(input.statusCode ?? 200)
    .type('text/html; charset=utf-8')
    .send(renderAppIconPage(app, csrfToken, input));
}

async function sendAppRedirectsPage(
  reply: FastifyReply,
  app: ManagedApp,
  csrfToken: string,
  input: AppRedirectsPageInput,
): Promise<void> {
  setDeveloperPageHeaders(reply);
  await reply
    .status(input.statusCode ?? 200)
    .type('text/html; charset=utf-8')
    .send(renderAppRedirectsPage(app, csrfToken, input));
}

interface IconUpload {
  readonly bytes?: Buffer;
  readonly csrfToken?: string;
  readonly tooLarge: boolean;
}

// Unexpected files are drained so the multipart stream finishes; oversized
// files surface via the truncation flag rather than an exception.
async function readIconUpload(request: FastifyRequest): Promise<IconUpload> {
  let bytes: Buffer | undefined;
  let csrfToken: string | undefined;
  let tooLarge = false;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'icon') {
        await part.toBuffer();
        continue;
      }
      const uploaded = await part.toBuffer();
      if (part.file.truncated) {
        tooLarge = true;
        continue;
      }
      bytes = uploaded;
      continue;
    }
    if (part.fieldname === 'csrfToken' && typeof part.value === 'string') {
      csrfToken = part.value;
    }
  }

  return {
    ...(bytes === undefined ? {} : { bytes }),
    ...(csrfToken === undefined ? {} : { csrfToken }),
    tooLarge,
  };
}
