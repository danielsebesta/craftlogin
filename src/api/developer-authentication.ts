import type { FastifyReply, FastifyRequest } from 'fastify';

import type {
  AuthenticatedDeveloperSession,
  DeveloperSessionService,
} from '../developers/session-service.js';
import { english } from '../locales/en.js';
import {
  clearDeveloperSessionCookie,
  DEVELOPER_SESSION_COOKIE,
  readSignedCookie,
  setDeveloperSessionCookie,
} from './developer-cookies.js';
import { ApiError } from './errors.js';

export interface DeveloperAuthentication {
  authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthenticatedDeveloperSession | undefined>;
  logout(session: AuthenticatedDeveloperSession, reply: FastifyReply): Promise<void>;
  require(request: FastifyRequest, reply: FastifyReply): Promise<AuthenticatedDeveloperSession>;
  requireAdministrator(session: AuthenticatedDeveloperSession): void;
  requireCsrf(session: AuthenticatedDeveloperSession, candidate: unknown): void;
}

export class DeveloperRequestAuthenticator implements DeveloperAuthentication {
  public constructor(
    private readonly sessions: Pick<
      DeveloperSessionService,
      'authenticate' | 'revoke' | 'verifyCsrf'
    >,
  ) {}

  public async authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthenticatedDeveloperSession | undefined> {
    const sessionId = readSignedCookie(request, DEVELOPER_SESSION_COOKIE);
    if (sessionId === undefined) {
      return undefined;
    }

    const session = await this.sessions.authenticate(sessionId, requestSignal(request));
    if (session === undefined) {
      clearDeveloperSessionCookie(reply);
      return undefined;
    }

    setDeveloperSessionCookie(reply, session.sessionId, session.expiresInSeconds);
    return session;
  }

  public async require(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthenticatedDeveloperSession> {
    const session = await this.authenticate(request, reply);
    if (session === undefined) {
      throw new ApiError(
        401,
        'developer_unauthorized',
        english.api.errors.developerAuthenticationRequired,
      );
    }
    return session;
  }

  public requireAdministrator(session: AuthenticatedDeveloperSession): void {
    if (session.role !== 'admin') {
      throw new ApiError(403, 'forbidden', english.api.errors.administratorRequired);
    }
  }

  public requireCsrf(session: AuthenticatedDeveloperSession, candidate: unknown): void {
    if (typeof candidate !== 'string' || !this.sessions.verifyCsrf(session.sessionId, candidate)) {
      throw new ApiError(403, 'forbidden', english.api.errors.csrfInvalid);
    }
  }

  public async logout(session: AuthenticatedDeveloperSession, reply: FastifyReply): Promise<void> {
    await this.sessions.revoke(session.sessionId);
    clearDeveloperSessionCookie(reply);
  }
}

export function requestSignal(request: FastifyRequest): {
  readonly ipAddress: string;
  readonly userAgent: string;
} {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] ?? 'unknown',
  };
}
