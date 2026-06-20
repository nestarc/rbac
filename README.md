# @nestarc/rbac

Tenant-aware RBAC and permission guards for production NestJS SaaS applications.

## Why @nestarc/rbac

`@nestarc/rbac` gives NestJS backends a small authorization layer that stays separate
from authentication. Your auth stack identifies the request subject, and RBAC decides
whether that subject has a tenant, global, or resource-scoped role with the required
permission.

- Works with route guards and service-level checks.
- Supports tenant-required, tenant-optional, and global-only decisions.
- Handles exact permissions, suffix wildcards such as `reports.*`, and `*`.
- Keeps persistence optional with in-memory storage for tests and Prisma/PostgreSQL
  storage for production apps.

## Installation

```bash
npm install @nestarc/rbac
```

Install NestJS peer dependencies in applications that do not already have them:

```bash
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
```

For Prisma/PostgreSQL storage, install the optional Prisma peers in the
consuming application:

```bash
npm install @prisma/client
npm install -D prisma
```

For focused setup notes, see [docs/installation.md](docs/installation.md).

## Quickstart

```ts
import { Module } from '@nestjs/common';
import { InMemoryRbacStorage, RbacModule } from '@nestarc/rbac';

@Module({
  imports: [
    RbacModule.forRoot({
      storage: new InMemoryRbacStorage(),
      tenant: { requiredByDefault: true },
    }),
  ],
})
export class AppModule {}
```

Seed a role and binding through `RbacService`:

```ts
await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'viewer',
  permissions: ['reports.read'],
});

await rbac.assignRole({
  tenantId: 'tenant_1',
  subject: { type: 'user', id: 'user_1', tenantId: 'tenant_1' },
  roleKey: 'viewer',
});
```

## Typed Permission Contracts

Use `defineRbacPermissions()` when an application wants autocomplete and literal
types for permission keys while keeping persisted values as strings.

```ts
import { Can, defineRbacPermissions } from '@nestarc/rbac';

export const permissions = defineRbacPermissions({
  reports: {
    read: 'reports.read',
    export: 'reports.export',
  },
} as const);

@Can(permissions.reports.read, { tenant: 'required' })
readReport() {
  return { ok: true };
}
```

Existing string permissions such as `@Can('reports.read')` continue to work.

## Strict Options

`createStrictRbacOptions()` provides a fail-closed starting point without changing
the package defaults.

```ts
import { InMemoryRbacStorage, RbacModule, createStrictRbacOptions } from '@nestarc/rbac';

RbacModule.forRoot(
  createStrictRbacOptions({
    storage: new InMemoryRbacStorage(),
  }),
);
```

The helper enables `requireMetadata`, tenant-required defaults, tenant boundary
write validation, and denied storage-error behavior. Explicit overrides remain
available for routes or apps that need compatibility behavior.

## Protecting Routes

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Can, CurrentRbacSubject, RbacGuard, type RbacSubject } from '@nestarc/rbac';

@Controller('reports')
export class ReportsController {
  @UseGuards(RbacGuard)
  @Can('reports.read', { tenant: 'required' })
  @Get(':reportId')
  readReport(@CurrentRbacSubject() subject: RbacSubject) {
    return { viewedBy: subject.id };
  }
}
```

Use `@Can()` or `@RequirePermissions()` for permissions, `@RequireRole()` for role
keys, and `@SkipRbac()` for health checks or public routes. See
[docs/guards.md](docs/guards.md).

## Tenant-Aware Checks

Tenant-aware checks use a tenant ID from the subject, request, headers, or a custom
tenant resolver. When `tenant.requiredByDefault` is true, protected routes deny if
no tenant can be resolved.

```ts
import { InMemoryRbacStorage, RbacModule } from '@nestarc/rbac';
import { createTenancyTenantResolver } from '@nestarc/rbac/integrations/tenancy';

const tenantContext = {
  getTenantId: () => 'tenant_1',
};

RbacModule.forRoot({
  storage: new InMemoryRbacStorage(),
  tenantResolver: createTenancyTenantResolver(() => tenantContext.getTenantId()),
  tenant: {
    requiredByDefault: true,
    allowGlobalRolesInTenant: false,
  },
});
```

For direct service checks:

```ts
await rbac.can({
  subject: { type: 'user', id: 'user_1', tenantId: 'tenant_1' },
  tenantId: 'tenant_1',
  tenantMode: 'required',
  permission: 'reports.read',
});
```

## Resource-Scoped Roles

Resource-scoped bindings let one subject hold a role only for a specific object, such
as one project.

```ts
await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'project-maintainer',
  permissions: ['project.member.invite'],
});

await rbac.assignRole({
  tenantId: 'tenant_1',
  subject: { type: 'user', id: 'user_1' },
  roleKey: 'project-maintainer',
  resource: { type: 'project', id: 'project_1' },
});
```

```ts
@Can('project.member.invite', {
  tenant: 'required',
  resource: { type: 'project', idParam: 'projectId' },
})
@Post(':projectId/invitations')
invite() {
  return { ok: true };
}
```

Unscoped bindings still satisfy resource checks, which keeps tenant-wide admin roles
useful.

## Prisma Setup

Install Prisma in the consuming app, copy the example RBAC models from
`prisma/schema.prisma.example`, and apply `prisma/migrations/0001_init_rbac.sql`
through your migration workflow.

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
      }),
    }),
  ],
})
export class AppModule {}
```

Run this package's Prisma adapter contract tests with:

```bash
npm run test:prisma
```

See [docs/prisma.md](docs/prisma.md).

## API Key Recipe

API key auth should validate the key first and attach `request.apiKeyContext` or
`request.apiKey`. The RBAC subject resolver then maps that record to an `api_key`
subject.

```ts
import { InMemoryRbacStorage, RbacModule } from '@nestarc/rbac';
import { createApiKeySubjectResolver } from '@nestarc/rbac/integrations/api-keys';

RbacModule.forRoot({
  storage: new InMemoryRbacStorage(),
  subjectResolver: createApiKeySubjectResolver(),
  tenant: { requiredByDefault: true },
});
```

The resolver reads `keyId` or `id`, preserves `tenantId` when present, and stores
the source record on `subject.attributes`. See
[examples/api-keys](examples/api-keys).

## Testing Utilities

```ts
import { Test } from '@nestjs/testing';
import { RbacService } from '@nestarc/rbac';
import { TestRbacModule, expectAllowed, rbacUser } from '@nestarc/rbac/testing';

const moduleRef = await Test.createTestingModule({
  imports: [
    TestRbacModule.forRoot({
      tenant: { requiredByDefault: true },
      subject: rbacUser('user_1', 'tenant_1'),
    }),
  ],
}).compile();

const rbac = moduleRef.get(RbacService);
await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'viewer',
  permissions: ['reports.read'],
});
await rbac.assignRole({
  tenantId: 'tenant_1',
  subject: rbacUser('user_1', 'tenant_1'),
  roleKey: 'viewer',
});

await expectAllowed(rbac, {
  subject: rbacUser('user_1', 'tenant_1'),
  tenantId: 'tenant_1',
  permission: 'reports.read',
});
```

See [docs/testing.md](docs/testing.md).

## Change Events

Apps that cache effective permissions can subscribe to mutation events without
using audit logs as cache invalidation messages.

```ts
RbacModule.forRoot({
  storage,
  changePublisher: {
    publish(event) {
      cache.invalidate(event);
    },
  },
});
```

## Security Notes

- Authentication is not included. Use your existing auth guard to attach `request.user`, `request.rbacSubject`, or a custom `subjectResolver`.
- Tenant-required routes fail closed when tenant identity is missing.
- Wildcards are limited to `*` and suffix wildcards such as `reports.*`.
- Global roles do not apply inside tenants by default.
- Use `NoopRbacAuditLogger` from the root package when an app wants to pass an explicit audit logger without emitting events.
- Use `createAuditLogRbacLogger()` from `@nestarc/rbac/integrations/audit-log` to map RBAC audit events to a structural audit logger.
- Do not log raw subject attributes unless your application has reviewed the data stored by the auth integration.
