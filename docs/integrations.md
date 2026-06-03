# Integrations

Integration helpers are dependency-free adapters around common request shapes. They
do not import optional peer packages at runtime.

## Tenancy

`createTenancyTenantResolver()` accepts a callback. The callback can read from the
tenant context used by the consuming application, including async-local storage or
a request-scoped provider.

```ts
import { InMemoryRbacStorage, RbacModule } from '@nestarc/rbac';
import { createTenancyTenantResolver } from '@nestarc/rbac/integrations/tenancy';

const tenancyContext = {
  getTenantId: () => 'tenant_1',
};

RbacModule.forRoot({
  storage: new InMemoryRbacStorage(),
  tenantResolver: createTenancyTenantResolver(() => tenancyContext.getTenantId()),
  tenant: { requiredByDefault: true },
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

