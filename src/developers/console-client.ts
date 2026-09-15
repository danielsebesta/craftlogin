import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '../generated/prisma/client.js';

export const CONSOLE_CLIENT_NAME = 'Developer Console';
export const CONSOLE_CALLBACK_PATH = '/developers/callback';

export interface ConsoleOAuthClient {
  readonly clientId: string;
  readonly redirectUri: string;
}

export function consoleCallbackUrl(issuer: string): string {
  return `${issuer}${CONSOLE_CALLBACK_PATH}`;
}

// The Developer Console is one OAuth client among many: it authenticates
// through the standard authorization flow like every other application. Its
// record is seeded at startup so the login flow never depends on manual
// registration. Seeding only repairs the callback URL and never touches
// ownership, which stays operator-assigned.
export async function ensureConsoleClient(
  database: PrismaClient,
  issuer: string,
): Promise<ConsoleOAuthClient> {
  const redirectUri = consoleCallbackUrl(issuer);
  const existing = await database.app.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { clientId: true, id: true, redirectUris: true },
    where: { name: CONSOLE_CLIENT_NAME },
  });
  if (existing !== null) {
    if (existing.redirectUris.length !== 1 || existing.redirectUris[0] !== redirectUri) {
      await database.app.update({
        data: { redirectUris: [redirectUri] },
        where: { id: existing.id },
      });
    }
    return { clientId: existing.clientId, redirectUri };
  }

  const created = await database.app.create({
    data: {
      clientId: `cl_${randomBytes(24).toString('base64url')}`,
      clientSecretHash: null,
      name: CONSOLE_CLIENT_NAME,
      ownerUuid: null,
      redirectUris: [redirectUri],
    },
    select: { clientId: true },
  });
  return { clientId: created.clientId, redirectUri };
}
