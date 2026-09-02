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

This repository includes PostgreSQL-backed adapter contract tests:

```bash
npm run test:prisma
```

The integration test uses exact Prisma 7.10.0 with `@prisma/adapter-pg` against
PostgreSQL 16. It runs the same contract behavior as the in-memory adapter and
verifies resource-scoped bindings, expirations, revocation, mutation outcomes,
concurrent duplicate event suppression, metadata round trips, and permission
matching. CI repeats the same 34-test
PostgreSQL contract with exact Prisma 6.19.3 and its legacy engine client. The separate
`npm run test:consumer:modern` gate packs the package and performs a fresh strict
install with exact NestJS 11.2.1 and Prisma 7.10.0 before checking CommonJS, ESM,
and TypeScript declaration consumption.
