export const CONSOLE_CLIENT_NAME = 'Developer Console';
export const CONSOLE_CALLBACK_PATH = '/developers/callback';
// A fixed public id makes seeding an atomic upsert, and a user-registered app
// can never be adopted as the console by reusing the name.
export const CONSOLE_CLIENT_ID = 'cl_developer_console';

export interface ConsoleOAuthClient {
  readonly clientId: string;
  readonly redirectUri: string;
}

export interface ConsoleClientStore {
  readonly app: {
    upsert(options: {
      create: {
        clientId: string;
        clientSecretHash: null;
        name: string;
        ownerUuid: null;
        redirectUris: string[];
        verifiedAt: Date;
      };
      select: { clientId: true; id: true };
      update: { name: string; redirectUris: string[] };
      where: { clientId: string };
    }): Promise<{ clientId: string; id: string }>;
    updateMany(options: {
      data: { verifiedAt: Date };
      where: { id: string; verifiedAt: null };
    }): Promise<{ count: number }>;
  };
}

export function consoleCallbackUrl(issuer: string): string {
  return `${issuer}${CONSOLE_CALLBACK_PATH}`;
}

// Seeded so console login never depends on manual registration. Seeding only
// repairs the callback URL and the first-party label; ownership stays
// operator-assigned.
export async function ensureConsoleClient(
  database: ConsoleClientStore,
  issuer: string,
): Promise<ConsoleOAuthClient> {
  const redirectUri = consoleCallbackUrl(issuer);
  const app = await database.app.upsert({
    create: {
      clientId: CONSOLE_CLIENT_ID,
      clientSecretHash: null,
      name: CONSOLE_CLIENT_NAME,
      ownerUuid: null,
      redirectUris: [redirectUri],
      verifiedAt: new Date(),
    },
    select: { clientId: true, id: true },
    update: { name: CONSOLE_CLIENT_NAME, redirectUris: [redirectUri] },
    where: { clientId: CONSOLE_CLIENT_ID },
  });
  // First-party means the verified label; the condition avoids rewriting an
  // unchanged timestamp.
  await database.app.updateMany({
    data: { verifiedAt: new Date() },
    where: { id: app.id, verifiedAt: null },
  });
  return { clientId: app.clientId, redirectUri };
}
