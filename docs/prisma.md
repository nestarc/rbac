# Prisma

`PrismaRbacStorage` is exported from `@nestarc/rbac/prisma`. It implements the
same storage contract as `InMemoryRbacStorage` and expects a Prisma-client-like
object with RBAC model delegates.

## Schema And Migration

Copy the RBAC models from `prisma/schema.prisma.example` into the consuming app's
Prisma schema. Copy the model blocks into the app's existing schema; keep the
app-owned generator and datasource configuration. The models map to these
PostgreSQL tables:

- `rbac_roles`
- `rbac_permissions`
- `rbac_role_permissions`
- `rbac_role_bindings`

Apply `prisma/migrations/0001_init_rbac.sql` through the app's migration workflow
or translate the SQL into the migration system already used by the app.

RBAC does not automatically rewrite existing identifiers. Before adopting a
version with canonical identifier enforcement, inventory outer whitespace in the
RBAC tenant, role, binding, subject, resource, and permission columns, resolve any
trim-induced uniqueness collisions, and migrate those values explicitly.

```bash
npm run prisma:generate
```

## Prisma 7 Client Setup

Prisma 7 uses the `prisma-client` generator with an explicit output path and
reads the CLI datasource URL from `prisma.config.ts`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

```ts
// prisma.config.ts
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
});
```

Direct PostgreSQL clients also use the Prisma 7 driver adapter:

```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const storage = new PrismaRbacStorage(prisma);
```

Prisma 5 and 6 consumers can keep the `prisma-client-js` generator, datasource
URL in the schema, and their existing `new PrismaClient()` setup.

## NestJS Registration

```ts
import { Module } from '@nestjs/common';
import { RbacModule } from '@nestarc/rbac';
import { PrismaRbacStorage } from '@nestarc/rbac/prisma';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    RbacModule.forRootAsync({
      imports: [PrismaModule],
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => ({
        storage: new PrismaRbacStorage(prisma),
        tenant: { requiredByDefault: true },
      }),
    }),
  ],
})
export class AppModule {}
```

## Role Data

Create tenant roles and assign them through `RbacService`; the same calls work
with in-memory and Prisma-backed storage.

```ts
await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'billing-admin',
  permissions: ['billing.invoice.read', 'billing.invoice.write'],
});

await rbac.assignRole({
  tenantId: 'tenant_1',
  subject: { type: 'user', id: 'user_1', tenantId: 'tenant_1' },
  roleKey: 'billing-admin',
});
```

## Verification

This repository includes PostgreSQL-backed adapter contract tests:

```bash
npm run test:prisma
```

The integration test uses exact Prisma 7.10.0 with `@prisma/adapter-pg` against
PostgreSQL 16. It runs the same contract behavior as the in-memory adapter and
verifies resource-scoped bindings, expirations, revocation, concurrency handling,
metadata round trips, and permission matching. CI repeats the same 28-test
PostgreSQL contract with exact Prisma 6.19.3 and its legacy engine client. The separate
`npm run test:consumer:modern` gate packs the package and performs a fresh strict
install with exact NestJS 11.2.1 and Prisma 7.10.0 before checking CommonJS, ESM,
and TypeScript declaration consumption.
