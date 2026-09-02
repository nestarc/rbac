# Prisma

`PrismaRbacStorage` is exported from `@nestarc/rbac/prisma`. It implements the
same storage contract as `InMemoryRbacStorage` and expects a Prisma-client-like
object with RBAC model delegates.

## Schema and public import

Copy the RBAC models from `prisma/schema.prisma.example` into the consuming app's
Prisma schema. Copy the model blocks into the app's existing schema; keep the
app-owned generator and datasource configuration. The models map to these
PostgreSQL tables:

- `rbac_roles`
- `rbac_permissions`
- `rbac_role_permissions`
- `rbac_role_bindings`

Import the adapter only through its public package subpath:

```ts
import { PrismaRbacStorage } from '@nestarc/rbac/prisma';
```

Do not import `dist/**`, `src/**`, or an adapter implementation file. Those paths
are package internals and are not public exports.

RBAC does not automatically rewrite existing identifiers. Before adopting a
version with canonical identifier enforcement, inventory outer whitespace in the
RBAC tenant, role, binding, subject, resource, and permission columns, resolve any
trim-induced uniqueness collisions, and migrate those values explicitly.

Choose one client setup below. Prisma 5/6 and Prisma 7 use different generator,
datasource, import, and constructor contracts; do not combine the snippets.

## Prisma 5/6 legacy-client setup

Install the legacy client and CLI on the same major version. The exact maintained
Prisma 6 evidence uses 6.19.3. A Prisma 5 application uses the same setup with
`@5` for both packages:

```bash
npm install @prisma/client@6
npm install -D prisma@6
```

Keep the `prisma-client-js` generator and the datasource URL in the schema:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Construct the generated client without a driver adapter:

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaRbacStorage } from '@nestarc/rbac/prisma';

const prisma = new PrismaClient();
const storage = new PrismaRbacStorage(prisma);
```

With `DATABASE_URL` set, generate the client and apply the shipped SQL through
the legacy schema-based CLI. In a production application, first copy or translate
the SQL into the app-owned migration workflow so migration history remains owned
by the application.

```bash
export DATABASE_URL='postgresql://rbac:rbac@127.0.0.1:5432/rbac_test'
npx prisma generate --schema=prisma/schema.prisma
npx prisma db execute --schema=prisma/schema.prisma --file=node_modules/@nestarc/rbac/prisma/migrations/0001_init_rbac.sql
```

## Prisma 7 driver-adapter setup

Install the client, CLI, PostgreSQL driver adapter, and driver. The exact
maintained evidence uses Prisma 7.10.0:

```bash
npm install @prisma/client@7 @prisma/adapter-pg pg
npm install -D prisma@7
```

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
import { PrismaRbacStorage } from '@nestarc/rbac/prisma';
import { PrismaClient } from './generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const storage = new PrismaRbacStorage(prisma);
```

With `DATABASE_URL` set, generate through `prisma.config.ts` and apply the shipped
SQL. As with Prisma 5/6, production applications should adopt the SQL into their
own migration workflow rather than treating `db execute` as application migration
history.

```bash
export DATABASE_URL='postgresql://rbac:rbac@127.0.0.1:5432/rbac_test'
npx prisma generate --config=prisma.config.ts
npx prisma db execute --config=prisma.config.ts --file=node_modules/@nestarc/rbac/prisma/migrations/0001_init_rbac.sql
```

## Storage Trust Boundary

Both built-in adapters implement the package storage contract. A custom
`RbacStorage` is still a trusted authorization dependency: it must execute lookups
for the requested subject, omit revoked bindings, protect its connection, and
control any adapter side effects.

`RbacService` defensively rechecks effective roles and permissions before using
them. A returned row is eligible only when its tenant/global provenance matches
the query, its optional expiry is a finite `Date` that is not earlier than the
decision time, its resource scope is a complete matching pair, and its identifiers
and permission shape are canonical. `expiresAt === now` remains active; only
`expiresAt < now` is expired. Tenant checks query global rows only when
`tenant.allowGlobalRolesInTenant` is explicitly enabled.

This validation does not turn an arbitrary adapter into an untrusted sandbox. The
effective-row interface contains neither the queried subject nor `revokedAt`, so
RBAC cannot independently verify subject provenance or revocation. Custom adapters
must preserve those filters and should run the shared storage contract. Invalid or
out-of-scope rows fail closed rather than being silently repaired.

## Indexed Role-ID Lookup

`PrismaRbacStorage.findRoleById({ roleId })` implements the optional strict-write
lookup capability with an ID-constrained `rbacRole.findFirst` query. It loads the
permission edges for that single role so tenant validation receives the same
`RbacRole` shape as other adapter lookups. It does not call `findMany`,
`listRoles({})`, or load the complete role/permission graph. The migration SQL
defines `rbac_roles.id` as the primary key, so PostgreSQL can serve this predicate
through its primary-key index.

## Mutation Outcomes And Concurrency

`PrismaRbacStorage` implements the optional outcome-aware mutation capability
used by `RbacService`. Role create/update decisions and assignment reactivation
are made inside the adapter transaction; delete and revoke outcomes use the
database mutation count. PostgreSQL uniqueness constraints serialize competing
role-key and active-binding inserts. On a unique race the adapter retries the
lookup, so one identical concurrent create/assignment reports `created` and the
remaining invocations report `no-op`.

An identical duplicate does not update the row merely to produce an event.
Service-level `updateRole()` reports a missing role as a conflict and never calls
the explicit legacy `upsertRole()` creation path. Audit and change publishers run
after the database transaction and remain best effort; they are not part of the
Prisma transaction and do not provide distributed exactly-once delivery.

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

This repository includes PostgreSQL-backed adapter contract tests. A plain
`npm run test:prisma` is not sufficient evidence: the suite intentionally skips
when both `RBAC_PRISMA_DATABASE_URL` and `DATABASE_URL` are absent. Always run the
full URL → generate → migrate → test sequence and confirm the result reports no
skipped tests.

### Prisma 7.10.0 repository contract

From a clean repository checkout with a disposable PostgreSQL 16 database:

```bash
export DATABASE_URL='postgresql://rbac:rbac@127.0.0.1:5432/rbac_test'
export RBAC_PRISMA_DATABASE_URL="$DATABASE_URL"
npm run prisma:generate
npm run prisma:migrate:test
RBAC_PRISMA_CLIENT=modern npm run test:prisma
```

### Prisma 6.19.3 repository contract

This recipe changes `package.json`, `package-lock.json`, and `node_modules`. Run it
only in a disposable worktree or CI checkout, never over uncommitted user work.
Set the same two PostgreSQL URLs shown in the Prisma 7 recipe, then run:

```bash
npm ci
npm run prisma:generate
npm pkg set 'devDependencies.@prisma/client=6.19.3' 'devDependencies.prisma=6.19.3'
npm install --no-save --ignore-scripts --strict-peer-deps --no-audit --no-fund @prisma/client@6.19.3 prisma@6.19.3
npm ls --depth=0 @nestjs/common @nestjs/core @prisma/client prisma
npm run prisma:generate:legacy
npm run prisma:migrate:test:legacy
RBAC_PRISMA_CLIENT=legacy npm run test:prisma
```

The Prisma 7 lane uses exact Prisma 7.10.0 and `@prisma/adapter-pg`; the legacy
lane uses exact Prisma 6.19.3. Both run against PostgreSQL 16 and exercise the same
storage contract: resource-scoped bindings, expirations, revocation, mutation
outcomes, concurrent duplicate event suppression, metadata round trips, and
permission matching. The separate `npm run test:consumer:modern` gate packs the
package, performs a fresh strict install, copies every shipped TypeScript example
out of that installed tarball, and typechecks those examples together with the
CommonJS, ESM, declaration, and API-key integration smokes.
