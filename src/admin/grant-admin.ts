import { loadEnvironment } from '../config/environment.js';
import {
  PrismaDeveloperAccessRepository,
  developerUuidSchema,
} from '../developers/developer-repository.js';
import { createDatabaseClient } from '../infrastructure/database.js';
import { english } from '../locales/en.js';
import { getErrorKind } from '../logging/error-kind.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger(process.env['LOG_LEVEL'] ?? 'info');

async function main(): Promise<void> {
  const parsedUuid = developerUuidSchema.safeParse(process.argv[2]?.toLowerCase());
  if (!parsedUuid.success) {
    process.stderr.write(`${english.developer.cli.invalidUuid}\n${english.developer.cli.usage}\n`);
    process.exitCode = 1;
    return;
  }
  const uuid = parsedUuid.data;
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
