# Prisma

`PrismaRbacStorage` is exported from `@nestarc/rbac/prisma`. It implements the
same storage contract as `InMemoryRbacStorage` and expects a Prisma-client-like
object with RBAC model delegates.

## Schema And Migration

Copy the RBAC models from `prisma/schema.prisma.example` into the consuming app's
Prisma schema. The models map to these PostgreSQL tables:

- `rbac_roles`
- `rbac_permissions`
- `rbac_role_permissions`
- `rbac_role_bindings`

Apply `prisma/migrations/0001_init_rbac.sql` through the app's migration workflow
or translate the SQL into the migration system already used by the app.

```bash
npm run prisma:generate
```

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

The integration test uses `DATABASE_URL`, runs the same contract behavior as the
in-memory adapter, and verifies resource-scoped bindings, expirations, revocation,
and permission matching against PostgreSQL.
