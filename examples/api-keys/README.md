# API Keys Example

This example validates an API key before RBAC runs, stores the key context on the
request, and uses `createApiKeySubjectResolver()` to authorize the API key subject.

Files:

- `src/api-key-auth.guard.ts` validates `x-api-key` and sets `request.apiKeyContext`.
- `src/app.module.ts` registers RBAC with `createApiKeySubjectResolver()`.
- `src/reports.controller.ts` runs API key auth before `RbacGuard`.

Seed the API key role against the RBAC subject ID:

```ts
const role = await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'report-api-reader',
  permissions: ['reports.read'],
});

await rbac.assignRole({
  tenantId: 'tenant_1',
  subject: { type: 'api_key', id: 'key_1', tenantId: 'tenant_1' },
  roleId: role.id,
});
```

