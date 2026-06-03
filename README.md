# @nestarc/rbac

Tenant-aware RBAC and permission guards for production NestJS SaaS applications.

## Install

```bash
npm install @nestarc/rbac
```

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

## Protect A Route

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Can, RbacGuard } from '@nestarc/rbac';

@Controller('reports')
export class ReportsController {
  @UseGuards(RbacGuard)
  @Can('reports.read')
  @Get()
  listReports() {
    return [];
  }
}
```

## Seed Roles

```ts
const role = await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'viewer',
  permissions: ['reports.read'],
});

await rbac.assignRole({
  tenantId: 'tenant_1',
  subject: { type: 'user', id: 'user_1' },
  roleId: role.id,
});
```

## Security Notes

- Authentication is not included. Use your existing auth guard to attach `request.user`, `request.rbacSubject`, or a custom `subjectResolver`.
- Tenant-required routes fail closed when tenant identity is missing.
- Wildcards are limited to `*` and suffix wildcards such as `reports.*`.
- Global roles do not apply inside tenants by default.
