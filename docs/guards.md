# Guards

`RbacGuard` evaluates route metadata created by the RBAC decorators. It can be used
directly on controllers and handlers or registered as a global NestJS `APP_GUARD`.

## Route-Level Guards

```ts
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  Can,
  CurrentRbacSubject,
  RequirePermissions,
  RequireRole,
  RbacGuard,
  SkipRbac,
  type RbacSubject,
} from '@nestarc/rbac';

@Controller('projects')
@UseGuards(RbacGuard)
export class ProjectsController {
  @SkipRbac('health check')
  @Get('health')
  health() {
    return { ok: true };
  }

  @Can('project.read', { tenant: 'required' })
  @Get(':projectId')
  read(@CurrentRbacSubject() subject: RbacSubject) {
    return { viewedBy: subject.id };
  }

  @RequirePermissions(['project.member.invite', 'project.member.read'], {
    mode: 'all',
    tenant: 'required',
    resource: { type: 'project', idParam: 'projectId' },
  })
  @Post(':projectId/invitations')
  invite(@CurrentRbacSubject() subject: RbacSubject) {
    return { invitedBy: subject.id };
  }

  @RequireRole('project-owner', {
    tenant: 'required',
    resource: { type: 'project', idParam: 'projectId' },
  })
  @Post(':projectId/archive')
  archive() {
    return { archived: true };
  }
}
```

`@Can(permission)` is an alias for `@RequirePermission(permission)`.
`@RequirePermissions()` defaults to `mode: 'all'`; pass `mode: 'any'` when one
permission is enough.

## Global Guard Registration

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InMemoryRbacStorage, RbacGuard, RbacModule } from '@nestarc/rbac';

@Module({
  imports: [
    RbacModule.forRoot({
      storage: new InMemoryRbacStorage(),
      requireMetadata: true,
      tenant: { requiredByDefault: true },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: RbacGuard }],
})
export class AppModule {}
```

With `requireMetadata: true`, routes without RBAC metadata deny unless they use
`@SkipRbac()`. Auth guards should run before RBAC so a subject is available.

## Tenant Modes

- `tenant: 'required'` denies when no tenant ID can be resolved.
- `tenant: 'optional'` evaluates tenant roles when a tenant exists and global roles
  otherwise.
- `tenant: 'none'` evaluates global roles only.

When an option is not set on the decorator, the guard uses
`tenant.requiredByDefault` from `RbacModule.forRoot()`.

Default HTTP tenant resolution checks the subject `tenantId`, `request.tenantId`,
`request.tenant.id`, and the `x-tenant-id` header. A custom `tenantResolver` runs
as the final fallback when those sources are missing.

## Resource Declarations

Resource checks can read IDs from route params, headers, query strings, functions,
or injectable resolver tokens:

```ts
@Can('project.member.invite', {
  tenant: 'required',
  resource: { type: 'project', idParam: 'projectId' },
})
@Post(':projectId/invitations')
invite(@CurrentRbacSubject() subject: RbacSubject) {
  return { invitedBy: subject.id };
}
```

```ts
@Can('report.export', {
  tenant: 'required',
  resource: { type: 'report', idHeader: 'x-report-id' },
})
@Get('exports')
exportReport() {
  return { ok: true };
}
```

If a route declares a resource and the ID is missing, the guard denies before
calling the controller method.
