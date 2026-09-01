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

## Subject Sources and Namespaces

Without a configured `subjectResolver`, RBAC reads valid identities from
`request.rbacSubject`, `request.user`, and the API-key carriers. If more than one
valid source is present, their exact `(type, id, tenantId)` tuples must agree or
the guard fails closed with `RBAC_SUBJECT_MISSING` before authorization. When they
agree, the selected record keeps the precedence `rbacSubject`, `user`, then the
canonical `apiKey` (or deprecated `apiKeyContext` fallback). A malformed or
internally conflicting populated API-key source also fails closed when a user or
RBAC subject is present.

The default user mapping reads `id`, `sub`, then `userId`. A non-empty string
`request.user.type` remains the subject type for compatibility; otherwise the type
is `user`. This means the default user carrier does not promise a fixed `user`
namespace. Configure a custom `subjectResolver` if the application must force one:

```ts
RbacModule.forRoot({
  storage,
  subjectResolver: (context) => {
    const request = context.switchToHttp().getRequest();
    return { type: 'user', id: request.user.sub, tenantId: request.user.tenantId };
  },
});
```

A configured resolver is authoritative and is not reconciled with these default
HTTP carriers. Canonical API-key records always map to `api_key`. Subject type is
part of identity, so the same ID in `user`, `service_account`, and `api_key`
namespaces does not share bindings. Authentication and guard ordering remain the
application's responsibility.

## Tenant Modes

- `tenant: 'required'` denies when no tenant ID can be resolved.
- `tenant: 'optional'` evaluates tenant roles when a tenant exists and global roles
  otherwise.
- `tenant: 'none'` evaluates global roles only.

When an option is not set on the decorator, the guard uses
`tenant.requiredByDefault` from `RbacModule.forRoot()`.

Default HTTP tenant resolution checks the subject `tenantId`, `request.tenantId`,
`request.tenant.id`, and the `x-tenant-id` header. Every populated source must
agree; a conflict denies before authorization.

A configured `tenantResolver` is authoritative by default. RBAC always calls it
for tenant-aware requirements and reconciles its result with every populated HTTP
source. A string selects that tenant, `null` explicitly selects global scope, and
`undefined` delegates to the consistent HTTP sources. A conflict, including a
tenant-bound subject conflicting with an authoritative global (`null`) result,
denies with `RBAC_PERMISSION_DENIED` and records only the
`tenant_source_conflict` audit category.

`tenant: 'none'` is an explicit global authorization requirement. It resolves to
`null` without calling the configured resolver or inspecting HTTP tenant carriers.
For a temporary migration from versions that used HTTP sources first, opt in to
the deprecated behavior explicitly:

```ts
RbacModule.forRoot({
  storage,
  tenantResolver,
  tenant: { resolverMode: 'legacy-fallback' },
});
```

Remove this opt-in after the authentication/tenancy middleware writes consistent
tenant identity. Even in legacy mode, conflicting populated HTTP sources deny.

Direct `RbacService.can()` calls similarly require a non-null explicit `tenantId`
to match `subject.tenantId`. An explicit `tenantId: null` selects global scope;
`tenantMode: 'none'` also selects global scope but does not permit two different
non-null tenant IDs. With strict write validation, `assignRole()` requires the
subject tenant and binding tenant to agree before reconciling the role tenant.

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
