import { createHmac, timingSafeEqual } from 'node:crypto';

import type { SessionSignal } from '../oauth/session-security.js';
import { createSessionSignal } from '../oauth/session-security.js';
import type { DeveloperAccessRepository, DeveloperRole } from './developer-repository.js';
import type { DeveloperSessionRecord, RedisDeveloperSessionStore } from './session-store.js';

export interface DeveloperRequestSignal {
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface AuthenticatedDeveloperSession {
  readonly csrfToken: string;
  readonly expiresInSeconds: number;
  readonly role: DeveloperRole;
  readonly sessionId: string;
  readonly userUuid: string;
}

export interface DeveloperSessionLogger {
  info(bindings: SessionSignal & { readonly event: string }, message: string): void;
  warn(bindings: SessionSignal & { readonly event: string }, message: string): void;
}

export class DeveloperSessionService {
  public constructor(
    private readonly sessions: Pick<
      RedisDeveloperSessionStore,
      'create' | 'read' | 'revoke' | 'rotateRole'
    >,
    private readonly developers: Pick<DeveloperAccessRepository, 'find'>,
    private readonly logger: DeveloperSessionLogger,
    private readonly referenceKey: string,
  ) {
    if (referenceKey.length < 32) {
      throw new TypeError('A developer session reference key must contain at least 32 characters');
    }
  }

  public async create(
    userUuid: string,
    role: DeveloperRole,
    requestSignal: DeveloperRequestSignal,
  ): Promise<AuthenticatedDeveloperSession> {
    const signal = createSessionSignal(
      'new-developer-session',
      requestSignal.ipAddress,
      requestSignal.userAgent,
      this.referenceKey,
    );
    const session = await this.sessions.create({
      ipAddress: signal.ipAddress,
      role,
      userAgent: signal.userAgent,
      userUuid,
    });
    this.logger.info(
      { ...this.signalFor(session, requestSignal), event: 'developer_session_created' },
      'Developer session created',
    );
    return this.toAuthenticated(session);
  }

  public async authenticate(
    sessionId: string,
    requestSignal: DeveloperRequestSignal,
  ): Promise<AuthenticatedDeveloperSession | undefined> {
    let session = await this.sessions.read(sessionId);
    if (session === undefined) {
      return undefined;
    }

    const access = await this.developers.find(session.userUuid);
    if (access === undefined) {
      await this.sessions.revoke(session.sessionId);
      return undefined;
    }

    if (access.role !== session.role) {
      session = await this.sessions.rotateRole(session.sessionId, access.role);
      if (session === undefined) {
        return undefined;
      }
      this.logger.info(
        { ...this.signalFor(session, requestSignal), event: 'developer_session_rotated' },
        'Developer session rotated after an access change',
      );
    }

    const currentSignal = this.signalFor(session, requestSignal);
    if (
      currentSignal.ipAddress !== session.ipAddress ||
      currentSignal.userAgent !== session.userAgent
    ) {
      this.logger.warn(
        { ...currentSignal, event: 'developer_session_signal_changed' },
        'Developer session request signal changed',
      );
    }

    return this.toAuthenticated(session);
  }

  public async revoke(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }

  public verifyCsrf(sessionId: string, candidate: string): boolean {
    const expected = Buffer.from(this.csrfToken(sessionId), 'utf8');
    const actual = Buffer.from(candidate, 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private csrfToken(sessionId: string): string {
    return createHmac('sha256', this.referenceKey)
      .update('craftlogin-developer-csrf\0', 'utf8')
      .update(sessionId, 'utf8')
      .digest('base64url');
  }

  private signalFor(
    session: DeveloperSessionRecord,
    requestSignal: DeveloperRequestSignal,
  ): SessionSignal {
    return createSessionSignal(
      session.sessionId,
      requestSignal.ipAddress,
      requestSignal.userAgent,
      this.referenceKey,
    );
  }

  private toAuthenticated(session: DeveloperSessionRecord): AuthenticatedDeveloperSession {
    return {
      csrfToken: this.csrfToken(session.sessionId),
      expiresInSeconds: session.expiresInSeconds,
      role: session.role,
      sessionId: session.sessionId,
      userUuid: session.userUuid,
    };
  }
}
