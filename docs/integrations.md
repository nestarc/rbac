# Integrations

Integration helpers are dependency-free adapters around common request shapes. They
do not import optional peer packages at runtime.

## Tenancy

`createTenancyTenantResolver()` accepts a callback. The callback can read from the
tenant context used by the consuming application, including async-local storage or
a request-scoped provider. `createNestarcTenancyResolver()` is exported as a
PRD-compatible alias with the same callback signature.

```ts
import { InMemoryRbacStorage, RbacModule } from '@nestarc/rbac';
import {
  createNestarcTenancyResolver,
  createTenancyTenantResolver,
} from '@nestarc/rbac/integrations/tenancy';

const tenancyContext = {
  getTenantId: () => 'tenant_1',
};

RbacModule.forRoot({
  storage: new InMemoryRbacStorage(),
  tenantResolver: createTenancyTenantResolver(() => tenancyContext.getTenantId()),
  tenant: { requiredByDefault: true },
});

RbacModule.forRoot({
  storage: new InMemoryRbacStorage(),
  tenantResolver: createNestarcTenancyResolver(() => tenancyContext.getTenantId()),
});
```

The helper only calls the callback and returns its `string`, `null`, or `undefined`
tenant ID result.

## API Keys

`createApiKeySubjectResolver()` reads `request.apiKeyContext` first and falls back
to `request.apiKey`. It maps `keyId` or `id` to the RBAC subject ID, maps `tenantId`
when present, and keeps the source record on `subject.attributes`.

```ts
import { InMemoryRbacStorage, RbacModule } from '@nestarc/rbac';
import { createApiKeySubjectResolver } from '@nestarc/rbac/integrations/api-keys';

RbacModule.forRoot({
  storage: new InMemoryRbacStorage(),
  subjectResolver: createApiKeySubjectResolver(),
  tenant: { requiredByDefault: true },
});
```

An API key auth guard should validate the presented key before RBAC runs:

```ts
request.apiKeyContext = {
  keyId: 'key_1',
  tenantId: 'tenant_1',
  ownerId: 'user_1',
};
```

## Audit Logging

RBAC accepts any structural logger with a `log(event)` method. Deny decisions from
`RbacGuard` emit `rbac.permission.denied`, and write operations such as role
creation, permission grants, assignments, and revocations emit RBAC audit events.

```ts
import { InMemoryRbacStorage, NoopRbacAuditLogger, RbacModule } from '@nestarc/rbac';

RbacModule.forRoot({
  storage: new InMemoryRbacStorage(),
  auditLogger: new NoopRbacAuditLogger(),
});
```

```ts
RbacModule.forRoot({
  storage,
  auditLogger: {
    log(event) {
      auditLog.write({
        type: event.type,
        tenantId: event.tenantId,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        metadata: event.metadata,
      });
    },
  },
});
```

RBAC does not log `subject.attributes` by default.

### `@nestarc/audit-log`

Use `createAuditLogRbacLogger()` when an application already has a structural
audit logger. The adapter does not import `@nestarc/audit-log` from the root
package and keeps the peer dependency optional.

```ts
import { createAuditLogRbacLogger } from '@nestarc/rbac/integrations/audit-log';

RbacModule.forRoot({
  storage,
  auditLogger: createAuditLogRbacLogger({
    auditLog,
    source: 'rbac',
  }),
});
```

The adapter maps RBAC event types to `action`, uses `success` for allow/write
events and `failure` for denied events, and removes secret-shaped fields such as
tokens, API key secrets, request headers, request bodies, and raw attributes from
metadata.

## Change Events

Audit events describe what happened for security and compliance review. Change
events are separate operational hooks for cache invalidation, outbox publishing,
or local permission refreshes.

```ts
RbacModule.forRoot({
  storage,
  changePublisher: {
    async publish(event) {
      await outbox.publish('rbac.policy.changed', event);
    },
  },
});
```

RBAC publishes change events after successful role, permission, and binding
mutations. Publisher failures are swallowed by default, matching audit logger
behavior, so cache invalidation hooks must be monitored by the consuming
application. The package does not provide distributed cache consistency or a
broker integration.
