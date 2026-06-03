# Testing

`@nestarc/rbac/testing` exports test helpers that work with any test framework.
They throw plain `Error` instances instead of depending on Vitest or Jest globals.

```ts
import { Test } from '@nestjs/testing';
import { RbacService } from '@nestarc/rbac';
import { TestRbacModule, expectAllowed, expectDenied, rbacUser } from '@nestarc/rbac/testing';

const moduleRef = await Test.createTestingModule({
  imports: [
    TestRbacModule.forRoot({
      tenant: { requiredByDefault: true },
      subject: rbacUser('user_1', 'tenant_1'),
    }),
  ],
}).compile();

const rbac = moduleRef.get(RbacService);
const subject = rbacUser('user_1', 'tenant_1');
const role = await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'viewer',
  permissions: ['reports.read'],
});

await rbac.assignRole({
  tenantId: 'tenant_1',
  subject,
  roleId: role.id,
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
  subject: rbacUser('user_1', 'tenant_1'),
  tenant: { requiredByDefault: true },
});
```

## Subject Fixtures

```ts
import { rbacApiKey, rbacServiceAccount, rbacUser } from '@nestarc/rbac/testing';

const user = rbacUser('user_1', 'tenant_1');
const apiKey = rbacApiKey('key_1', 'tenant_1');
const service = rbacServiceAccount('worker_1');
```

Use service-level `rbac.can()` or controller tests with `RbacGuard` depending on
whether the test is checking RBAC decisions or full HTTP wiring.

