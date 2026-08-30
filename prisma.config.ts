import { defineConfig } from 'prisma/config';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://rbac:rbac@127.0.0.1:5432/rbac_test';

export default defineConfig({
  schema: 'test/integration/prisma.schema.prisma',
  datasource: {
    url: databaseUrl,
  },
});
