# Resource-Scoped Roles Example

This example protects project routes with resource-scoped RBAC. A scoped binding
allows the subject to act on the matching project only. An unscoped tenant binding
also satisfies the resource check, which is useful for tenant admin roles.

Files:

- `src/app.module.ts` registers RBAC.
- `src/projects.controller.ts` declares the `project` resource from `:projectId`.

Seed a project-specific binding:

```ts
const role = await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'project-maintainer',
  permissions: ['project.member.invite'],
});

await rbac.assignRole({
  tenantId: 'tenant_1',
  subject: { type: 'user', id: 'user_1', tenantId: 'tenant_1' },
  roleId: role.id,
  resource: { type: 'project', id: 'project_1' },
});
```

