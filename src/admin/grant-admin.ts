import { loadEnvironment } from '../config/environment.js';
import { resolveDeveloperIdentifier } from '../developers/developer-identifier.js';
import {
  PrismaDeveloperAccessRepository,
  developerUuidSchema,
} from '../developers/developer-repository.js';
import { createDatabaseClient } from '../infrastructure/database.js';
import { english } from '../locales/en.js';
import { getErrorKind } from '../logging/error-kind.js';
import { createLogger } from '../logging/logger.js';
import { MemoryMinecraftCache } from '../mojang/cache.js';
import { HttpMojangClient } from '../mojang/client.js';

const logger = createLogger(process.env['LOG_LEVEL'] ?? 'info');

async function main(): Promise<void> {
  const players = new HttpMojangClient({ cache: new MemoryMinecraftCache() });
  const resolved = await resolveDeveloperIdentifier(process.argv[2] ?? '', players);
  if (resolved === undefined) {
    process.stderr.write(`${english.developer.cli.invalidUuid}\n${english.developer.cli.usage}\n`);
    process.exitCode = 1;
    return;
  }
  const uuid = developerUuidSchema.parse(resolved);

  const environment = loadEnvironment();
  const database = createDatabaseClient(environment.databaseUrl);

  try {
    await database.$connect();
    const developer = await new PrismaDeveloperAccessRepository(database).grant(uuid, 'admin');
    process.stdout.write(`${english.developer.cli.adminGranted} ${developer.uuid}.\n`);
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown): void => {
  logger.fatal({ errorKind: getErrorKind(error) }, 'Administrator bootstrap failed');
  process.exitCode = 1;
});
