import { createHmac } from 'node:crypto';

import type { KoaContextWithOIDC, Session } from 'oidc-provider';

export const SESSION_ABSOLUTE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_SLIDING_TTL_SECONDS = 12 * 60 * 60;

const MAX_IP_ADDRESS_LENGTH = 128;
const MAX_USER_AGENT_LENGTH = 512;
const SESSION_REFERENCE_LENGTH = 22;

export interface SessionSignal {
  readonly ipAddress: string;
  readonly sessionReference: string;
  readonly userAgent: string;
}

export interface SessionSignalLogger {
  info(signal: SessionSignal, message: string): void;
}

export function calculateSessionTtl(iat: number | undefined, nowEpochSeconds: number): number {
  const establishedAt =
    typeof iat === 'number' && Number.isSafeInteger(iat) ? iat : nowEpochSeconds;
  const absoluteRemaining = establishedAt + SESSION_ABSOLUTE_TTL_SECONDS - nowEpochSeconds;
  return Math.max(1, Math.min(SESSION_SLIDING_TTL_SECONDS, absoluteRemaining));
}

export function oidcSessionTtl(_context: KoaContextWithOIDC, session: Session): number {
  return calculateSessionTtl(session.iat, Math.floor(Date.now() / 1_000));
}

export function createSessionSignal(
  sessionUid: string,
  ipAddress: string,
  userAgent: string,
  referenceKey: string,
): SessionSignal {
  return {
    ipAddress: normalizeSignal(ipAddress, MAX_IP_ADDRESS_LENGTH),
    sessionReference: `session_${createHmac('sha256', referenceKey)
      .update(sessionUid, 'utf8')
      .digest('base64url')
      .slice(0, SESSION_REFERENCE_LENGTH)}`,
    userAgent: normalizeSignal(userAgent, MAX_USER_AGENT_LENGTH),
  };
}

export function installSessionSignalLogging(
  provider: import('oidc-provider').default,
  logger: SessionSignalLogger,
  cookieKeys: readonly string[],
): void {
  const referenceKey = cookieKeys[0];
  if (referenceKey === undefined) {
    throw new TypeError('A cookie signing key is required for session signal correlation');
  }

  provider.on('authorization.success', (context): void => {
    const session = context.oidc.entities.Session;
    if (session?.accountId === undefined) {
      return;
    }

    logger.info(
      createSessionSignal(session.uid, context.request.ip, context.get('user-agent'), referenceKey),
      'OIDC session authorization signal',
    );
  });
}

function normalizeSignal(value: string, maximumLength: number): string {
  let sanitized = '';
  for (const character of value) {
    sanitized += isControlCharacter(character) ? '\ufffd' : character;
  }
  const normalized = sanitized.trim();
  return (normalized.length === 0 ? 'unknown' : normalized).slice(0, maximumLength);
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return codePoint === undefined || codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
}
