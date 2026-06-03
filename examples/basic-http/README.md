# Basic HTTP Example

This example shows route-level RBAC with the in-memory storage adapter. It assumes
your auth layer attaches a user-like subject to `request.user` with `id` and
`tenantId`.

Files:

- `src/app.module.ts` registers `RbacModule`.
- `src/reports.controller.ts` protects HTTP routes with `RbacGuard` and `@Can()`.

Seed a role in application bootstrap, a test setup, or an admin workflow:

```ts
const role = await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'report-viewer',
  permissions: ['reports.read'],
});

await rbac.assignRole({
  tenantId: 'tenant_1',
  subject: { type: 'user', id: 'user_1', tenantId: 'tenant_1' },
  roleId: role.id,
});
```

