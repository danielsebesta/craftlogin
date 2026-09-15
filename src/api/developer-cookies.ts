import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

export const CONSOLE_OAUTH_COOKIE = '__Secure-craftlogin_console_oauth';
export const DEVELOPER_SESSION_COOKIE = '__Host-craftlogin_developer_session';

export interface ConsoleOAuthTransaction {
  readonly state: string;
  readonly verifier: string;
}

const BASE_COOKIE_OPTIONS: CookieSerializeOptions = {
  httpOnly: true,
  priority: 'high',
  sameSite: 'lax',
  secure: true,
  signed: true,
};

export function readSignedCookie(request: FastifyRequest, name: string): string | undefined {
  const cookie = request.cookies[name];
  if (cookie === undefined) {
    return undefined;
  }
  const result = request.unsignCookie(cookie);
  return result.valid ? result.value : undefined;
}

export function setConsoleOAuthCookie(
  reply: FastifyReply,
  transaction: ConsoleOAuthTransaction,
): void {
  void reply.setCookie(CONSOLE_OAUTH_COOKIE, JSON.stringify(transaction), {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 10 * 60,
    path: '/developers',
  });
}

const consoleOAuthCookieSchema = z.object({ state: z.string(), verifier: z.string() });

export function readConsoleOAuthCookie(
  request: FastifyRequest,
): ConsoleOAuthTransaction | undefined {
  const raw = readSignedCookie(request, CONSOLE_OAUTH_COOKIE);
  if (raw === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const result = consoleOAuthCookieSchema.safeParse(parsed);
  return result.success ? { state: result.data.state, verifier: result.data.verifier } : undefined;
}

export function clearConsoleOAuthCookie(reply: FastifyReply): void {
  void reply.clearCookie(CONSOLE_OAUTH_COOKIE, {
    httpOnly: true,
    path: '/developers',
    sameSite: 'lax',
    secure: true,
  });
}

export function setDeveloperSessionCookie(
  reply: FastifyReply,
  sessionId: string,
  maxAge: number,
): void {
  void reply.setCookie(DEVELOPER_SESSION_COOKIE, sessionId, {
    ...BASE_COOKIE_OPTIONS,
    maxAge,
    path: '/',
  });
}

export function clearDeveloperSessionCookie(reply: FastifyReply): void {
  void reply.clearCookie(DEVELOPER_SESSION_COOKIE, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: true,
  });
}
