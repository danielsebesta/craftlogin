import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const DEVELOPER_LOGIN_COOKIE = '__Secure-craftlogin_developer_login';
export const DEVELOPER_SESSION_COOKIE = '__Host-craftlogin_developer_session';

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

export function setDeveloperLoginCookie(reply: FastifyReply, loginId: string): void {
  void reply.setCookie(DEVELOPER_LOGIN_COOKIE, loginId, {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 5 * 60,
    path: '/developers',
  });
}

export function clearDeveloperLoginCookie(reply: FastifyReply): void {
  void reply.clearCookie(DEVELOPER_LOGIN_COOKIE, {
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
