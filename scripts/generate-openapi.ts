import { readFile, writeFile } from 'node:fs/promises';

import { createApiServer } from '../src/api/server.js';

const outputUrl = new URL('../openapi.yaml', import.meta.url);
const unavailable = (): never => {
  throw new Error('Documentation-only dependency was called');
};

async function generate(): Promise<void> {
  const server = await createApiServer({
    accessTokens: { authenticate: unavailable },
    appManager: { list: unavailable, remove: unavailable },
    apps: { register: unavailable },
    clients: {
      findClientName: unavailable,
      isAllowedOrigin: unavailable,
    },
    cookieKeys: [
      'documentation-cookie-key-a'.padEnd(48, 'a'),
      'documentation-cookie-key-b'.padEnd(48, 'b'),
    ],
    developerAuthentication: {
      authenticate: unavailable,
      logout: unavailable,
      require: unavailable,
      requireAdministrator: unavailable,
      requireCsrf: unavailable,
    },
    developerLogins: { complete: unavailable, start: unavailable, status: unavailable },
    developers: { find: unavailable, grant: unavailable, list: unavailable, revoke: unavailable },
    interactions: {
      complete: unavailable,
      start: unavailable,
      status: unavailable,
    },
    issuer: 'https://craftlogin.com',
    minecraftBaseDomain: 'craftlogin.com',
    minecraft: {
      avatars: { findRawSkin: unavailable, render: unavailable },
      players: { findProfileById: unavailable, findProfileByName: unavailable },
      skins: { fetchSkin: unavailable },
    },
    nodeEnvironment: 'production',
    oidcHandler: unavailable,
    readiness: { check: unavailable },
    users: { findCurrentUser: unavailable },
  });

  try {
    await server.ready();
    const generated = `${server.swagger({ yaml: true }).trimEnd()}\n`;
    if (process.argv.includes('--check')) {
      const committed = await readFile(outputUrl, 'utf8').catch((): string => '');
      if (committed !== generated) {
        throw new Error('openapi.yaml is out of date; run npm run openapi:generate');
      }
      return;
    }
    await writeFile(outputUrl, generated, 'utf8');
  } finally {
    await server.close();
  }
}

void generate().catch((error: unknown): void => {
  const kind = error instanceof Error ? error.message : typeof error;
  process.stderr.write(`OpenAPI generation failed: ${kind}\n`);
  process.exitCode = 1;
});
