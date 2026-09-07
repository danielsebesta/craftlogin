import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const localDatabaseUrl =
  'postgresql://craftlogin:craftlogin-dev-only@localhost:5432/craftlogin?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? localDatabaseUrl,
  },
});
