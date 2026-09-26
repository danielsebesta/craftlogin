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
        ownerUuid: string | null;
        redirectUris: string[];
        verifiedAt: Date;
      };
      select: { clientId: true; id: true };
      update: { name: string; redirectUris: string[] };
      where: { clientId: string };
    }): Promise<{ clientId: string; id: string }>;
    updateMany(options: {
      data: { ownerUuid?: string; verifiedAt?: Date };
      where: { id: string; ownerUuid?: null; verifiedAt?: null };
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
  ownerUuid?: string,
): Promise<ConsoleOAuthClient> {
  const redirectUri = consoleCallbackUrl(issuer);
  const app = await database.app.upsert({
    create: {
      clientId: CONSOLE_CLIENT_ID,
      clientSecretHash: null,
      name: CONSOLE_CLIENT_NAME,
      ownerUuid: ownerUuid ?? null,
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
  // The configured owner adopts an unowned console client; an existing owner is
  // a deliberate operator choice and is not overwritten.
  if (ownerUuid !== undefined) {
    await database.app.updateMany({
      data: { ownerUuid },
      where: { id: app.id, ownerUuid: null },
    });
  }
  return { clientId: app.clientId, redirectUri };
}
