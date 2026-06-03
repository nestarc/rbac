# Testing

`@nestarc/rbac/testing` exports test helpers that work with any test framework.
They throw plain `Error` instances instead of depending on Vitest or Jest globals.

```ts
import { Test } from '@nestjs/testing';
import { RbacService } from '@nestarc/rbac';
import { TestRbacModule, expectAllowed, expectDenied, user } from '@nestarc/rbac/testing';

const moduleRef = await Test.createTestingModule({
  imports: [
    TestRbacModule.forRoot({
      tenant: { requiredByDefault: true },
      subject: user('user_1', 'tenant_1'),
    }),
  ],
}).compile();

const rbac = moduleRef.get(RbacService);
const subject = user('user_1', 'tenant_1');
await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'viewer',
  permissions: ['reports.read'],
});

await rbac.assignRole({
  tenantId: 'tenant_1',
  subject,
  roleKey: 'viewer',
});

await expectAllowed(rbac, {
  subject,
  tenantId: 'tenant_1',
  permission: 'reports.read',
});

await expectDenied(
  rbac,
  {
    subject,
    tenantId: 'tenant_1',
    permission: 'reports.write',
  },
  'denied_no_matching_permission',
);
```

## TestRbacModule

`TestRbacModule.forRoot()` wraps `RbacModule.forRoot()` with an
`InMemoryRbacStorage` default. Pass `storage` to exercise another adapter, `subject`
for a fixed test subject, or `subjectResolver` to mirror application auth behavior.

```ts
TestRbacModule.forRoot({
  storage: customStorage,
  subject: user('user_1', 'tenant_1'),
  tenant: { requiredByDefault: true },
});
```

## Subject Fixtures

```ts
import {
  apiKey,
  rbacApiKey,
  rbacServiceAccount,
  rbacUser,
  serviceAccount,
  user,
} from '@nestarc/rbac/testing';

const subject = user('user_1', 'tenant_1');
const keySubject = apiKey('key_1', 'tenant_1');
const service = serviceAccount('worker_1');

// Legacy explicit names remain available.
const sameSubject = rbacUser('user_1', 'tenant_1');
const sameKeySubject = rbacApiKey('key_1', 'tenant_1');
const sameService = rbacServiceAccount('worker_1');
```

Use service-level `rbac.can()` or controller tests with `RbacGuard` depending on
whether the test is checking RBAC decisions or full HTTP wiring.

## `withTenantRbac()` Recipe

Tests that need the same tenant-aware module setup repeatedly can keep a small
local helper around `TestRbacModule.forRoot()`:

```ts
import { Test } from '@nestjs/testing';
import { RbacService } from '@nestarc/rbac';
import { TestRbacModule, user } from '@nestarc/rbac/testing';

export async function withTenantRbac(tenantId = 'tenant_1') {
  const subject = user('user_1', tenantId);
  const moduleRef = await Test.createTestingModule({
    imports: [
      TestRbacModule.forRoot({
        tenant: { requiredByDefault: true },
        subject,
      }),
    ],
  }).compile();

  return {
    moduleRef,
    rbac: moduleRef.get(RbacService),
    subject,
    tenantId,
  };
}
```
