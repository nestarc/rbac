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
tenant ID result. `RbacGuard` treats a configured resolver as authoritative: a
string or `null` must agree with subject/request/header tenant identity, while
`undefined` delegates to consistent HTTP sources. Conflicts fail closed before the
permission lookup. The deprecated `tenant.resolverMode: 'legacy-fallback'` option
exists only for migration from the old default-first precedence.

## API Keys

`createApiKeySubjectResolver()` uses `request.apiKey` as the canonical Nestarc
source. It maps `keyId` or `id` to the RBAC subject ID, maps `tenantId` when
present, and keeps the source record on `subject.attributes`. Identifiers are
opaque strings: RBAC does not trim, case-fold, normalize, or coerce them.

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
request.apiKey = {
  keyId: 'key_1',
  tenantId: 'tenant_1',
  ownerId: 'user_1',
};
```

The deprecated `request.apiKeyContext` property remains a fallback only when
`request.apiKey` is absent. When both properties are populated, their resolved
key and tenant IDs must match exactly; otherwise resolution fails closed. Matching
dual values select `request.apiKey`. Migrate custom middleware to `request.apiKey`
before the legacy fallback is removed in the next breaking minor release
(`0.3.0` at the earliest).

`@nestarc/api-keys@0.3.2` writes only `request.apiKey`. A dual-source request
therefore indicates that stale or custom in-process middleware also wrote the
legacy property; the standard API Keys Guard alone does not create that state.

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
