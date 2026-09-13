import { createHash, randomBytes } from 'node:crypto';
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, z } from 'zod';

import type { AppManager } from '../developers/app-management.js';
import type {
  DeveloperAccessRepository,
  DeveloperRole,
} from '../developers/developer-repository.js';
import { LastAdministratorError } from '../developers/developer-repository.js';
import { developerLoginIdSchema, type DeveloperLoginService } from '../developers/login-service.js';
import { ApiError } from './errors.js';
import { resolveDeveloperIdentifier } from '../developers/developer-identifier.js';
import type { MinecraftPlayerLookup } from '../mojang/client.js';
import { english } from '../locales/en.js';
import {
  SkinVerificationPlayerNotFoundError,
  SkinVerificationResolutionError,
} from '../verification/skin-verification-service.js';
import {
  MicrosoftJavaOwnershipRequiredError,
  MicrosoftOAuthUnavailableError,
} from '../verification/microsoft-oauth-client.js';
import {
  MicrosoftOAuthVerificationService,
  MicrosoftVerificationResolutionError,
} from '../verification/microsoft-oauth-verification-service.js';
import type { AppRegistrar, AppRegistrationInput } from './app-registration.js';
import type { CurrentUser, CurrentUserLookup } from './current-user.js';
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
  developerLoginCreationRateLimit,
  developerLoginPageRateLimit,
  microsoftVerificationRateLimit,
  skinVerificationLookupRateLimit,
  skinVerificationStartRateLimit,
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
  developerLoginSkinDownloadRouteSchema,
  skinVerificationLookupRouteSchema,
  microsoftOAuthCallbackRouteSchema,
  microsoftOAuthStartRouteSchema,
  developerLoginSkinStartRouteSchema,
  developerLoginSkinStatusRouteSchema,
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

interface DeveloperLoginQuery {
  readonly microsoftError?: 'ownership' | 'unavailable';
  readonly skinError?: 'not-found' | 'unavailable';
}

interface DeveloperMicrosoftCallbackQuery {
  readonly code?: string;
  readonly error?: string;
  readonly state: string;
}

interface SkinVerificationBody {
  readonly username: string;
}

export interface DeveloperRoutesOptions {
  readonly appManager: AppManager;
  readonly apps: AppRegistrar;
  readonly authentication: DeveloperAuthentication;
  readonly developers: DeveloperAccessRepository;
  readonly logins: Pick<DeveloperLoginService, 'complete' | 'create' | 'resume' | 'status'> &
    Partial<
      Pick<DeveloperLoginService, 'checkSkin' | 'getSkinChallenge' | 'lookupSkin' | 'startSkin'>
    >;
  readonly logger: FastifyBaseLogger;
  readonly minecraftBaseDomain: string;
  readonly microsoftOAuth?: {
    readonly verification: Pick<
      MicrosoftOAuthVerificationService,
      'createAuthorizationUrl' | 'verify'
    >;
  };
  readonly players?: MinecraftPlayerLookup;
  readonly users: CurrentUserLookup;
}

export function registerDeveloperRoutes(
  server: FastifyInstance,
  options: DeveloperRoutesOptions,
): void {
  const checkLoginCreationRateLimit = server.createRateLimit({
    keyGenerator: (request): string => `developer-login-creation:${request.ip}`,
    max: developerLoginCreationRateLimit.max,
    timeWindow: developerLoginCreationRateLimit.timeWindow,
  });

  server.get<{ Querystring: DeveloperLoginQuery }>(
    '/developers/login',
    { config: { rateLimit: developerLoginPageRateLimit }, schema: developerLoginPageRouteSchema },
    async (request, reply): Promise<void> => {
      if ((await options.authentication.authenticate(request, reply)) !== undefined) {
        await reply.redirect('/developers', 303);
        return;
      }

      let attempt = await options.logins.resume(readSignedCookie(request, DEVELOPER_LOGIN_COOKIE));
      if (attempt === undefined) {
        const limit = await checkLoginCreationRateLimit(request);
        if (!limit.isAllowed && limit.isExceeded) {
          void reply.header('retry-after', String(Math.max(1, limit.ttlInSeconds)));
          throw new ApiError(429, 'rate_limited', english.api.errors.rateLimited);
        }
        attempt = await options.logins.create();
      }
      setDeveloperLoginCookie(reply, attempt.loginId);
      setDeveloperPageHeaders(reply);
      await reply
        .type('text/html; charset=utf-8')
        .send(
          renderDeveloperLoginPage(
            attempt,
            options.minecraftBaseDomain,
            request.query.skinError,
            request.query.microsoftError,
            options.microsoftOAuth !== undefined,
          ),
        );
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

  server.get<{ Querystring: { readonly username: string } }>(
    '/developers/login/skin/lookup',
    {
      config: { rateLimit: skinVerificationLookupRateLimit },
      schema: skinVerificationLookupRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const loginId = readSignedCookie(request, DEVELOPER_LOGIN_COOKIE);
      if (loginId === undefined || options.logins.lookupSkin === undefined) {
        void reply.header('cache-control', 'no-store');
        await reply.send({ found: false });
        return;
      }
      if ((await options.logins.status(loginId)).status !== 'pending') {
        void reply.header('cache-control', 'no-store');
        await reply.send({ found: false });
        return;
      }
      const profile = await options.logins.lookupSkin(request.query.username);
      void reply.header('cache-control', 'no-store');
      await reply.send(
        profile === undefined
          ? { found: false }
          : {
              found: true,
              hasSkin: profile.hasSkin,
              model: profile.model,
              username: profile.username,
              uuid: profile.uuid,
            },
      );
    },
  );

  server.post(
    '/developers/login/microsoft/start',
    {
      config: { rateLimit: microsoftVerificationRateLimit },
      schema: microsoftOAuthStartRouteSchema,
    },
    async (request, reply): Promise<void> => {
      if (options.microsoftOAuth === undefined) {
        await reply.redirect('/developers/login', 303);
        return;
      }
      const loginId = readSignedCookie(request, DEVELOPER_LOGIN_COOKIE);
      if (loginId === undefined || (await options.logins.status(loginId)).status !== 'pending') {
        await reply.redirect('/developers/login', 303);
        return;
      }
      const transaction = createDeveloperMicrosoftTransaction(loginId);
      void reply.setCookie(
        transaction.cookieName,
        encodeDeveloperMicrosoftTransaction(transaction),
        {
          httpOnly: true,
          maxAge: 300,
          path: '/developers/login/microsoft/callback',
          priority: 'high',
          sameSite: 'lax',
          secure: true,
          signed: true,
        },
      );
      await reply.redirect(
        options.microsoftOAuth.verification.createAuthorizationUrl(
          transaction.state,
          transaction.codeChallenge,
        ),
        303,
      );
    },
  );

  server.get<{ Querystring: DeveloperMicrosoftCallbackQuery }>(
    '/developers/login/microsoft/callback',
    {
      config: { rateLimit: microsoftVerificationRateLimit },
      schema: microsoftOAuthCallbackRouteSchema,
    },
    async (request, reply): Promise<void> => {
      if (options.microsoftOAuth === undefined) {
        await reply.redirect('/developers/login', 303);
        return;
      }
      const transaction = readDeveloperMicrosoftTransaction(
        request.cookies,
        request.query.state,
        (value): ReturnType<typeof request.unsignCookie> => request.unsignCookie(value),
      );
      void reply.clearCookie(transaction.cookieName, {
        httpOnly: true,
        path: '/developers/login/microsoft/callback',
        sameSite: 'lax',
        secure: true,
      });
      if (request.query.error !== undefined) {
        await reply.redirect(
          request.query.error === 'access_denied'
            ? '/developers/login'
            : '/developers/login?microsoftError=unavailable',
          303,
        );
        return;
      }
      if (request.query.code === undefined) {
        await reply.redirect('/developers/login?microsoftError=unavailable', 303);
        return;
      }
      try {
        await options.microsoftOAuth.verification.verify(
          transaction.loginId,
          request.query.code,
          transaction.codeVerifier,
        );
        await reply.redirect('/developers/login', 303);
      } catch (error: unknown) {
        const destination =
          error instanceof MicrosoftJavaOwnershipRequiredError
            ? '/developers/login?microsoftError=ownership'
            : error instanceof MicrosoftOAuthUnavailableError ||
                error instanceof MicrosoftVerificationResolutionError
              ? '/developers/login?microsoftError=unavailable'
              : undefined;
        if (destination !== undefined) {
          await reply.redirect(destination, 303);
          return;
        }
        throw error;
      }
    },
  );

  server.post<{ Body: SkinVerificationBody }>(
    '/developers/login/skin/start',
    {
      config: { rateLimit: skinVerificationStartRateLimit },
      schema: developerLoginSkinStartRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const loginId = readSignedCookie(request, DEVELOPER_LOGIN_COOKIE);
      if (loginId === undefined || options.logins.startSkin === undefined) {
        await reply.redirect('/developers/login', 303);
        return;
      }
      const status = await options.logins.status(loginId);
      if (status.status !== 'pending') {
        await reply.redirect('/developers/login', 303);
        return;
      }
      try {
        await options.logins.startSkin(loginId, request.body.username);
      } catch (error: unknown) {
        if (error instanceof SkinVerificationPlayerNotFoundError) {
          await reply.redirect('/developers/login?skinError=not-found', 303);
          return;
        }
        if (error instanceof SkinVerificationResolutionError) {
          await reply.redirect('/developers/login?skinError=unavailable', 303);
          return;
        }
        throw error;
      }
      await reply.redirect('/developers/login', 303);
    },
  );

  server.get(
    '/developers/login/skin/download',
    { schema: developerLoginSkinDownloadRouteSchema },
    async (request, reply): Promise<void> => {
      const loginId = readSignedCookie(request, DEVELOPER_LOGIN_COOKIE);
      if (loginId === undefined || options.logins.getSkinChallenge === undefined) {
        await reply.redirect('/developers/login', 303);
        return;
      }
      const challenge = await options.logins.getSkinChallenge(loginId);
      if (challenge === undefined) {
        await reply.redirect('/developers/login', 303);
        return;
      }
      void reply.headers({
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="craftlogin-${challenge.username}.png"`,
        'x-content-type-options': 'nosniff',
      });
      await reply.type('image/png').send(challenge.body);
    },
  );

  server.get(
    '/developers/login/skin/original-download',
    { schema: developerLoginSkinDownloadRouteSchema },
    async (request, reply): Promise<void> => {
      const loginId = readSignedCookie(request, DEVELOPER_LOGIN_COOKIE);
      if (loginId === undefined || options.logins.getSkinChallenge === undefined) {
        await reply.redirect('/developers/login', 303);
        return;
      }
      const challenge = await options.logins.getSkinChallenge(loginId);
      if (challenge?.originalBody === undefined) {
        await reply.redirect('/developers/login', 303);
        return;
      }
      void reply.headers({
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="craftlogin-${challenge.username}-original.png"`,
        'x-content-type-options': 'nosniff',
      });
      await reply.type('image/png').send(challenge.originalBody);
    },
  );

  server.get(
    '/developers/login/skin/status',
    {
      config: { rateLimit: verificationStatusRateLimit },
      schema: developerLoginSkinStatusRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const loginId = readSignedCookie(request, DEVELOPER_LOGIN_COOKIE);
      void reply.header('cache-control', 'no-store');
      if (loginId === undefined || options.logins.checkSkin === undefined) {
        await reply.send({ status: 'expired' });
        return;
      }
      try {
        const status = await options.logins.checkSkin(loginId);
        await reply.send({ status: status.status });
      } catch (error: unknown) {
        if (error instanceof SkinVerificationResolutionError) {
          throw new ApiError(
            503,
            'service_unavailable',
            english.api.errors.minecraftSkinUnavailable,
            { cause: error },
          );
        }
        throw error;
      }
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
      void reply.header('cache-control', 'public, max-age=3600');
      await reply.type('text/css; charset=utf-8').send(developerStyles);
    },
  );
}

interface DeveloperMicrosoftTransaction {
  readonly codeChallenge: string;
  readonly codeVerifier: string;
  readonly cookieName: string;
  readonly loginId: string;
  readonly state: string;
}

function createDeveloperMicrosoftTransaction(loginId: string): DeveloperMicrosoftTransaction {
  const state = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  return {
    codeChallenge: createHash('sha256').update(codeVerifier, 'ascii').digest('base64url'),
    codeVerifier,
    cookieName: `__Secure-craftlogin_developer_ms_${state}`,
    loginId,
    state,
  };
}

function encodeDeveloperMicrosoftTransaction(transaction: DeveloperMicrosoftTransaction): string {
  return Buffer.from(
    JSON.stringify({ codeVerifier: transaction.codeVerifier, loginId: transaction.loginId }),
    'utf8',
  ).toString('base64url');
}

function readDeveloperMicrosoftTransaction(
  cookies: Readonly<Record<string, string | undefined>>,
  state: string,
  unsignCookie: (value: string) => {
    readonly renew: boolean;
    readonly valid: boolean;
    readonly value: string | null;
  },
): Pick<DeveloperMicrosoftTransaction, 'codeVerifier' | 'cookieName' | 'loginId' | 'state'> {
  const cookieName = `__Secure-craftlogin_developer_ms_${state}`;
  const signedValue = cookies[cookieName];
  if (signedValue === undefined) {
    throw new ApiError(400, 'bad_request', english.api.errors.microsoftStateInvalid);
  }
  const unsigned = unsignCookie(signedValue);
  if (!unsigned.valid || unsigned.value === null) {
    throw new ApiError(400, 'bad_request', english.api.errors.microsoftStateInvalid);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(unsigned.value, 'base64url').toString('utf8'));
  } catch {
    throw new ApiError(400, 'bad_request', english.api.errors.microsoftStateInvalid);
  }
  const parsed = z
    .object({
      codeVerifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
      loginId: developerLoginIdSchema,
    })
    .safeParse(decoded);
  if (!parsed.success) {
    throw new ApiError(400, 'bad_request', english.api.errors.microsoftStateInvalid);
  }
  return {
    codeVerifier: parsed.data.codeVerifier,
    cookieName,
    loginId: parsed.data.loginId,
    state,
  };
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
