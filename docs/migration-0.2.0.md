# Migration Guide: 0.1.x to 0.2.0

`@nestarc/rbac` 0.2.0 is designed as an additive upgrade. Existing string
permissions, decorators, module options, in-memory storage, and Prisma schema
remain compatible.

## No-Change Upgrade

```bash
npm install @nestarc/rbac@0.2
```

No database migration is required for the core 0.2.0 helpers. Applications that
assert exact decision object equality may need to allow the new optional
`decision.details` field.

## Adopt Typed Permissions

Create a permission contract and replace string literals incrementally:

```ts
import { defineRbacPermissions } from '@nestarc/rbac';

export const permissions = defineRbacPermissions({
  reports: {
    read: 'reports.read',
    export: 'reports.export',
  },
} as const);
```

Persisted permission values do not change. The contract only centralizes the
strings and gives TypeScript a literal union.

## Adopt Strict Options

Start strict mode in a test or one module first:

```ts
import { createStrictRbacOptions } from '@nestarc/rbac';

RbacModule.forRoot(
  createStrictRbacOptions({
    storage,
  }),
);
```

Before enabling it globally:

1. Mark public routes with `@SkipRbac()`.
2. Add RBAC metadata to protected routes.
3. Confirm auth or tenancy middleware resolves tenant context before RBAC runs.
4. Add denial tests for missing subject, missing tenant, missing resource, and missing permission.

## Use Audit-Log Integration

The audit-log adapter is available from an optional subpath:

```ts
import { createAuditLogRbacLogger } from '@nestarc/rbac/integrations/audit-log';
```

The root package does not require `@nestarc/audit-log` at runtime.

## Use Change Events

Use `changePublisher` for cache invalidation or outbox integration. Change events
are best-effort hooks and do not provide distributed cache consistency by
themselves.
