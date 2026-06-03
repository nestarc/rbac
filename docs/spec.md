# Technical Spec: `@nestarc/rbac`

**Status:** Ready for implementation planning  
**Date:** 2026-06-02  
**Source:** `docs/prd.md`  
**Package:** `@nestarc/rbac`

---

## 1. Purpose

`@nestarc/rbac` provides tenant-aware authorization primitives for NestJS SaaS backends. It does not authenticate requests. It evaluates a subject already attached to the request, or returned by a configured resolver, against role bindings and role permissions.

The MVP must make HTTP route authorization, service-level authorization, in-memory testing, and Prisma/PostgreSQL persistence work through one consistent RBAC model.

---

## 2. MVP Scope

### Included

- NestJS dynamic module with `forRoot()` and `forRootAsync()`.
- HTTP `RbacGuard` for route-level authorization.
- Decorators for permission, role, skip, and current subject access.
- Subject, tenant, and resource resolvers.
- `RbacService` for route-independent authorization and role management.
- Permission matcher with exact, suffix wildcard, and global wildcard support.
- In-memory storage adapter.
- Prisma/PostgreSQL storage adapter and migration assets.
- Stable typed errors and HTTP exception mapping.
- Test helpers and storage contract tests.
- README and docs for quickstart, guards, Prisma, testing, and integrations.
- Optional integration hooks for tenancy, API keys, and audit logging.

### Excluded

- Authentication, session, password, JWT issuing, and login flows.
- Admin UI.
- Frontend SDK.
- Billing, quotas, plans, and entitlement logic.
- OPA/Rego, Casbin, CASL-compatible DSL, or general ABAC expression engine.
- GraphQL-specific decorators.
- Organization hierarchy, nested team inheritance, and automatic row filtering.
- Distributed cache invalidation.

---

## 3. Baseline Repository Decisions

The current repository only contains `README.md`, `LICENSE`, and `docs/prd.md`, so the package skeleton should be initialized from scratch.

Use the following defaults unless a later repository convention is introduced before implementation:

- Package manager: `npm`.
- Language: TypeScript.
- Module format: dual ESM/CJS output.
- Build: `tsup` with declaration output.
- Test runner: `vitest`.
- Nest test support: `@nestjs/testing` and `supertest`.
- Lint/format: ESLint and Prettier.
- Runtime peer dependencies: `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs`.
- Optional peer dependencies: `@prisma/client`, `prisma`, `@nestarc/tenancy`, `@nestarc/api-keys`, `@nestarc/audit-log`.

---

## 4. Public Concepts

### Subject

A subject is the authorization principal. MVP supports string-extensible subject types.

```ts
export type RbacSubjectType = 'user' | 'api_key' | 'service_account' | string;

export interface RbacSubject {
  type: RbacSubjectType;
  id: string;
  tenantId?: string;
  displayName?: string;
  attributes?: Record<string, unknown>;
}
```

Rules:

- `type` and `id` are required for evaluation.
- Empty subject IDs are invalid.
- `attributes` may be used by application code but must not be logged by default.

### Tenant

Tenant is the SaaS authorization boundary. MVP models tenants by string ID only.

Route tenant modes:

- `required`: missing tenant denies.
- `optional`: tenant-aware evaluation when a tenant exists, global evaluation otherwise.
- `none`: global evaluation only.

Module defaults:

- `tenant.requiredByDefault` defaults to `false`.
- `tenant.allowGlobalRolesInTenant` defaults to `false`.

### Permission

Permissions are atomic string keys, using dot notation.

Supported matching:

- `invoice.read` grants `invoice.read`.
- `invoice.*` grants `invoice.read` and `invoice.write`.
- `*` grants all permissions.

There is no implicit hierarchy. `invoice.write` does not grant `invoice.read`.

### Role

```ts
export interface RbacRole {
  id: string;
  key: string;
  name?: string;
  description?: string;
  tenantId?: string | null;
  isSystem?: boolean;
  permissions: string[];
}
```

Role uniqueness:

- Global role keys are unique where `tenantId IS NULL`.
- Tenant role keys are unique per tenant.

### Binding

```ts
export interface RbacRoleBinding {
  id: string;
  tenantId?: string | null;
  subjectType: string;
  subjectId: string;
  roleId: string;
  resourceType?: string | null;
  resourceId?: string | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  metadata?: Record<string, unknown>;
}
```

Public assignment calls may use either the resolved role ID or the tenant-scoped
role key:

```ts
export type AssignRoleInput = {
  tenantId?: string | null;
  subject: RbacSubject;
  resource?: RbacResourceRef;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
} & ({ roleId: string; roleKey?: never } | { roleKey: string; roleId?: never });
```

Storage adapters receive `AssignRoleStorageInput`, where the service has already
resolved any public `roleKey` into `roleId`.

Rules:

- Only active bindings are evaluated.
- A binding is inactive if `revokedAt` is set.
- A binding is inactive if `expiresAt` is earlier than the evaluation clock.
- Assigning the same active binding is idempotent.

### Resource

```ts
export interface RbacResourceRef {
  type: string;
  id: string;
}
```

Resource matching decision:

- A route with no resource requirement evaluates only unscoped bindings.
- A route with a resource requirement allows either an unscoped binding or an exact resource binding.
- A scoped binding for a different resource denies.
- A missing declared resource ID denies.

This preserves tenant-wide roles such as `admin` while still supporting project-specific bindings.

---

## 5. Module API

### Options

```ts
export interface RbacModuleOptions {
  storage: RbacStorage;
  subjectResolver?: RbacSubjectResolver;
  tenantResolver?: RbacTenantResolver;
  auditLogger?: RbacAuditLogger;
  requireMetadata?: boolean;
  tenant?: {
    requiredByDefault?: boolean;
    allowGlobalRolesInTenant?: boolean;
  };
  storageErrors?: 'deny' | 'throw';
  logAllowedDecisions?: boolean;
  now?: () => Date;
}
```

Defaults:

- `requireMetadata`: `false`.
- `tenant.requiredByDefault`: `false`.
- `tenant.allowGlobalRolesInTenant`: `false`.
- `storageErrors`: `deny`.
- `logAllowedDecisions`: `false`.
- `now`: `() => new Date()`.

### Dynamic Module

```ts
RbacModule.forRoot({
  storage: new InMemoryRbacStorage(),
  tenant: { requiredByDefault: true },
});
```

```ts
RbacModule.forRootAsync({
  imports: [PrismaModule],
  inject: [PrismaService],
  useFactory: (prisma: PrismaService) => ({
    storage: new PrismaRbacStorage(prisma),
  }),
});
```

Acceptance:

- `RbacService`, `RbacGuard`, options, and storage are injectable.
- `RbacGuard` can be used directly in `@UseGuards()` or registered as `APP_GUARD`.
- `forRootAsync()` supports `imports`, `inject`, and `useFactory`.

---

## 6. Decorators And Metadata

### Decorators

```ts
@Can(permission: string, options?: RbacRequirementOptions)
@RequirePermission(permission: string, options?: RbacRequirementOptions)
@RequirePermissions(permissions: string[], options?: RbacRequirementOptions)
@RequireRole(roleKey: string, options?: RbacRequirementOptions)
@SkipRbac(reason?: string)
@CurrentRbacSubject()
```

`@Can()` and `@RequirePermission()` are aliases.

```ts
export interface RbacRequirementOptions {
  mode?: 'any' | 'all';
  tenant?: 'required' | 'optional' | 'none';
  resource?:
    | { type: string; idParam: string }
    | { type: string; idHeader: string }
    | { type: string; idQuery: string }
    | RbacResourceResolverToken;
  reason?: string;
}
```

Internal requirement metadata should normalize decorators into one of these forms:

```ts
export type RbacRequirement =
  | {
      kind: 'permission';
      permissions: string[];
      mode: 'any' | 'all';
      options: RbacRequirementOptions;
    }
  | {
      kind: 'role';
      roleKey: string;
      options: RbacRequirementOptions;
    };
```

### Metadata Semantics

- Class-level and handler-level requirements are merged.
- Handler metadata does not override class metadata.
- `@SkipRbac()` on a handler skips class-level requirements too.
- `@SkipRbac()` on a class skips all handlers unless a future version adds an override decorator.
- If no RBAC metadata exists and `requireMetadata` is `false`, the guard allows.
- If no RBAC metadata exists and `requireMetadata` is `true`, the guard denies with `RBAC_PERMISSION_DENIED`.

Use `Reflector.getAllAndMerge()` or equivalent logic for requirement collection.

---

## 7. Resolver Behavior

### Subject Resolver

Resolution order:

1. Configured `subjectResolver`, when present.
2. `request.rbacSubject`.
3. `request.user`.
4. `request.apiKeyContext`.
5. `request.apiKey`.

Default `request.user` mapping:

- `id` comes from `id`, `sub`, or `userId`.
- `type` defaults to `user`.
- `tenantId` is copied when present.
- original user object is stored as `attributes`.

Default API key mapping:

- `keyId` or `id` becomes subject ID.
- subject type is `api_key`.
- `tenantId` is copied when present.

If no subject resolves for a protected route, the guard throws 401 with `RBAC_SUBJECT_MISSING`.

### Tenant Resolver

Resolution order:

1. Requirement `tenant: 'none'` returns no tenant.
2. `subject.tenantId`.
3. `request.tenantId`.
4. `request.tenant?.id`.
5. `request.headers['x-tenant-id']`.
6. Configured `tenantResolver`.

Tenant mode behavior:

- `required`: missing tenant denies with `RBAC_TENANT_MISSING`.
- `optional`: missing tenant evaluates global roles only.
- `none`: tenant-scoped bindings are not evaluated.

### Resource Resolver

Built-in declarations:

```ts
@Can('project.read', { resource: { type: 'project', idParam: 'projectId' } })
@Can('project.read', { resource: { type: 'project', idQuery: 'projectId' } })
@Can('project.read', { resource: { type: 'project', idHeader: 'x-project-id' } })
```

Custom declaration:

```ts
@Can('project.update', { resource: ProjectResourceResolver })
```

If a resource is declared but cannot be resolved, the guard denies with `RBAC_RESOURCE_MISSING`.

---

## 8. Guard Flow

`RbacGuard` implements `CanActivate`.

Evaluation sequence:

1. Check `@SkipRbac()`.
2. Collect class and handler requirements.
3. Apply `requireMetadata`.
4. Resolve subject.
5. Resolve tenant mode and tenant ID.
6. Resolve resource when required.
7. Call `RbacService.can()` for each requirement.
8. If any requirement denies, map the decision to an HTTP exception.
9. Emit audit event for deny decisions and write operations.
10. Return `true` only when all requirements allow.

HTTP mapping:

| Case | HTTP status | Code |
|---|---:|---|
| Missing subject | 401 | `RBAC_SUBJECT_MISSING` |
| Missing required tenant | 403 | `RBAC_TENANT_MISSING` |
| Missing required resource | 403 | `RBAC_RESOURCE_MISSING` |
| Permission denied | 403 | `RBAC_PERMISSION_DENIED` |
| Storage failure with `storageErrors: 'throw'` | 500 | `RBAC_STORAGE_ERROR` |

Guard constraints:

- Must not require request-scoped providers.
- Must not leak role membership details in HTTP error messages.
- Must include stable `code` in response body.

---

## 9. RbacService

### API

```ts
export class RbacService {
  can(input: RbacCanInput): Promise<RbacDecision>;
  assertCan(input: RbacCanInput): Promise<void>;

  createRole(input: CreateRoleInput): Promise<RbacRole>;
  updateRole(input: UpdateRoleInput): Promise<RbacRole>;
  deleteRole(input: DeleteRoleInput): Promise<void>;

  grantPermission(input: GrantPermissionInput): Promise<void>;
  revokePermission(input: RevokePermissionInput): Promise<void>;

  assignRole(input: AssignRoleInput): Promise<RbacRoleBinding>;
  revokeRole(input: RevokeRoleInput): Promise<void>;

  listRoles(input: ListRolesInput): Promise<RbacRole[]>;
  listPermissions(input: ListPermissionsInput): Promise<string[]>;
  listBindings(input: ListBindingsInput): Promise<RbacRoleBinding[]>;
}
```

### Evaluation Input

```ts
export interface RbacCanInput {
  subject: RbacSubject;
  tenantId?: string | null;
  tenantMode?: 'required' | 'optional' | 'none';
  permission?: string;
  permissions?: string[];
  roleKey?: string;
  mode?: 'any' | 'all';
  resource?: RbacResourceRef;
  now?: Date;
}
```

### Decision

```ts
export interface RbacDecision {
  allowed: boolean;
  reason: RbacDecisionReason;
  subject?: RbacSubject;
  tenantId?: string | null;
  permission?: string;
  permissions?: string[];
  roleKey?: string;
  mode?: 'any' | 'all';
  matchedRoleKeys?: string[];
  matchedPermissions?: string[];
  resource?: RbacResourceRef;
}
```

Decision reasons:

```ts
export type RbacDecisionReason =
  | 'allowed_by_role'
  | 'allowed_by_role_permission'
  | 'denied_subject_missing'
  | 'denied_tenant_missing'
  | 'denied_resource_missing'
  | 'denied_no_matching_role'
  | 'denied_no_matching_permission'
  | 'denied_role_expired'
  | 'denied_resource_mismatch'
  | 'denied_storage_error';
```

Rules:

- `can()` returns a decision object and does not throw for normal denies.
- `can()` accepts exactly one requirement family per call: permission input or `roleKey`.
- If `tenantMode` is omitted, it is derived from module options: `required` when `tenant.requiredByDefault` is true, otherwise `optional`.
- Storage errors return `denied_storage_error` by default.
- With `storageErrors: 'throw'`, storage errors propagate as `RbacStorageError`.
- `assertCan()` throws `RbacPermissionDeniedError` when decision is denied.
- Service APIs validate subject, tenant, role, permission, and resource IDs before writing.

---

## 10. Authorization Algorithm

1. Normalize the requested requirement.
2. For permission requirements, normalize required permissions from `permission` and `permissions`.
3. For permission requirements, default `mode` to `all` when more than one permission is provided, otherwise `any`.
4. Validate subject and required IDs.
5. Resolve effective tenant evaluation:
   - tenant present: evaluate tenant bindings for that tenant.
   - tenant present and `allowGlobalRolesInTenant` enabled: also evaluate global bindings.
   - tenant absent with tenant mode `none` or `optional`: evaluate global bindings only.
   - tenant absent with tenant mode `required`: deny.
6. For role requirements, ask storage for active effective roles and match `roleKey`.
7. For permission requirements, ask storage for active effective permissions.
8. Filter out expired or revoked results defensively.
9. Filter by resource rules.
10. Match required permissions using exact, suffix wildcard, and global wildcard.
11. For `any`, allow when at least one required permission matches.
12. For `all`, allow only when every required permission matches.
13. Return matched roles and permissions when allowed.

Role requirement behavior:

- `@RequireRole('owner')` checks for an active effective binding to role key `owner`.
- Role checks use the same tenant and resource filtering rules as permission checks.
- A role check does not require the role to have permissions.
- Role checks return `allowed_by_role` when a role matches.
- Role checks return `denied_no_matching_role` when no active effective role matches.

Permission matcher:

```ts
export function matchesPermission(granted: string, required: string): boolean {
  if (granted === '*') return true;
  if (granted === required) return true;
  if (granted.endsWith('.*')) {
    const prefix = granted.slice(0, -1);
    return required.startsWith(prefix);
  }
  return false;
}
```

Input validation:

- Reject empty permission strings.
- Reject wildcard forms other than `*` and suffix `.*`.
- Reject empty tenant, subject, role, resource type, and resource ID strings.

---

## 11. Storage Contract

```ts
export interface RbacStorage {
  findRole(input: FindRoleInput): Promise<RbacRole | null>;
  upsertRole(input: UpsertRoleInput): Promise<RbacRole>;
  deleteRole(input: DeleteRoleInput): Promise<void>;

  grantPermission(input: GrantPermissionInput): Promise<void>;
  revokePermission(input: RevokePermissionInput): Promise<void>;
  listRolePermissions(input: ListRolePermissionsInput): Promise<string[]>;

  assignRole(input: AssignRoleStorageInput): Promise<RbacRoleBinding>;
  revokeRole(input: RevokeRoleStorageInput): Promise<void>;
  listBindings(input: ListBindingsStorageInput): Promise<RbacRoleBinding[]>;

  listEffectiveRoles(input: ListEffectiveRolesInput): Promise<RbacEffectiveRole[]>;
  listEffectivePermissions(input: ListEffectivePermissionsInput): Promise<RbacEffectivePermission[]>;
}
```

```ts
export interface RbacEffectiveRole {
  roleKey: string;
  roleId: string;
  bindingId: string;
  tenantId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  expiresAt?: Date | null;
}
```

```ts
export interface RbacEffectivePermission {
  permission: string;
  roleKey: string;
  roleId: string;
  bindingId: string;
  tenantId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  expiresAt?: Date | null;
}
```

Contract requirements:

- Write operations are idempotent where PRD requires idempotency.
- Effective roles and permissions only include active bindings.
- Expired and revoked bindings are never returned as effective roles or permissions.
- Tenant and resource filters are honored by the adapter and rechecked by service logic.
- Contract tests are reusable for every adapter.

### In-memory Adapter

Purpose:

- Unit tests, examples, and local development.

Constraints:

- Process-local only.
- No persistence.
- No cross-process synchronization.

### Prisma Adapter

Purpose:

- PostgreSQL-backed production adapter.

Implementation rules:

- Accept a Prisma client-like object to avoid coupling package types to a consumer-generated client.
- Use transactions for multi-table writes.
- Use one hot-path query for `listEffectivePermissions()` where practical.
- Keep Prisma as an optional peer dependency.
- Export from `@nestarc/rbac/prisma`.

Deliverables:

- `prisma/schema.prisma.example`.
- `prisma/migrations/0001_init_rbac.sql`.
- `docs/prisma.md`.

---

## 12. Prisma Data Model

Models:

- `RbacRole`
- `RbacPermission`
- `RbacRolePermission`
- `RbacRoleBinding`

Required SQL indexes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS rbac_roles_global_key_unique
  ON rbac_roles (key)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rbac_roles_tenant_key_unique
  ON rbac_roles (tenant_id, key)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rbac_active_binding_unique
  ON rbac_role_bindings (
    COALESCE(tenant_id, ''),
    subject_type,
    subject_id,
    role_id,
    COALESCE(resource_type, ''),
    COALESCE(resource_id, '')
  )
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS rbac_active_subject_lookup_idx
  ON rbac_role_bindings (tenant_id, subject_type, subject_id)
  WHERE revoked_at IS NULL;
```

Prisma schema should use string `subjectType` in `RbacRoleBinding`, not a closed enum, so custom subject types remain supported.

---

## 13. Errors

```ts
export class RbacError extends Error {
  readonly code: RbacErrorCode;
  readonly status?: number;
  readonly details?: Record<string, unknown>;
}

export type RbacErrorCode =
  | 'RBAC_CONFIG_ERROR'
  | 'RBAC_SUBJECT_MISSING'
  | 'RBAC_TENANT_MISSING'
  | 'RBAC_RESOURCE_MISSING'
  | 'RBAC_PERMISSION_DENIED'
  | 'RBAC_ROLE_NOT_FOUND'
  | 'RBAC_PERMISSION_NOT_FOUND'
  | 'RBAC_BINDING_NOT_FOUND'
  | 'RBAC_STORAGE_ERROR';
```

Rules:

- Messages are stable and safe for API clients.
- `details` may include non-sensitive IDs for tests and logs.
- Full subject attributes, binding metadata, and permission inventory are not exposed in HTTP responses.

Example response:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Permission denied",
  "code": "RBAC_PERMISSION_DENIED"
}
```

---

## 14. Audit Integration

The package exposes:

```ts
export interface RbacAuditLogger {
  log(event: RbacAuditEvent): void | Promise<void>;
}
```

Default implementation is no-op.

Events:

- `rbac.role.created`
- `rbac.role.updated`
- `rbac.role.deleted`
- `rbac.permission.granted`
- `rbac.permission.revoked`
- `rbac.role.assigned`
- `rbac.role.revoked`
- `rbac.permission.denied`

Rules:

- Deny decisions are logged when an audit logger is configured.
- Allow decisions are not logged by default.
- Log payloads must avoid full subject attributes and sensitive metadata.
- `@nestarc/audit-log` remains optional.

---

## 15. Package Structure

```txt
src/
  index.ts
  rbac.module.ts
  rbac.service.ts
  rbac.guard.ts
  constants.ts
  decorators/
  interfaces/
  adapters/
  errors/
  integrations/
  testing/
  utils/
prisma/
  schema.prisma.example
  migrations/
    0001_init_rbac.sql
examples/
  basic-http/
  api-keys/
  resource-scoped/
docs/
  prd.md
  spec.md
  installation.md
  guards.md
  prisma.md
  testing.md
  integrations.md
README.md
CHANGELOG.md
```

Subpath exports:

- `@nestarc/rbac`
- `@nestarc/rbac/prisma`
- `@nestarc/rbac/testing`
- `@nestarc/rbac/integrations/tenancy`
- `@nestarc/rbac/integrations/api-keys`

---

## 16. Testing Strategy

### Unit Tests

Required coverage:

- permission matcher
- decorator metadata
- subject resolver
- tenant resolver
- resource resolver
- guard exception mapping
- service authorization decisions
- service role and binding writes
- in-memory storage behavior

### Storage Contract Tests

Every adapter must pass the same contract scenarios:

1. create role with permissions
2. update role without unintended permission deletion
3. grant permission idempotently
4. revoke permission idempotently
5. assign role idempotently
6. revoke role idempotently
7. expired binding not effective
8. revoked binding not effective
9. tenant mismatch denies
10. resource binding applies only to matching resource
11. tenant-wide unscoped binding applies to requested resources
12. global binding does not apply in tenant by default
13. wildcard permission works
14. role requirement works for active matching role
15. role requirement does not require role permissions

### E2E Tests

Build a small Nest test app with:

- `GET /health` using `@SkipRbac()`.
- `GET /reports` using `@Can('reports.read')`.
- `POST /reports` using `@Can('reports.write')`.
- `POST /projects/:projectId/invitations` using a resource-scoped permission.

Expected matrix:

| Scenario | Expected |
|---|---:|
| no subject | 401 |
| subject but no tenant on tenant-required route | 403 |
| subject with wrong tenant role | 403 |
| viewer role with read permission | 200 |
| viewer role with write request | 403 |
| matching project resource binding | 200 or 201 |
| different project resource binding | 403 |

Coverage target:

- Statements: at least 90%.
- Branches: at least 85%.
- Permission matcher and guard: at least 95%, enforced in `vitest.config.ts`.

---

## 17. Documentation Deliverables

README must include:

1. Why `@nestarc/rbac`
2. Installation
3. Quickstart with in-memory storage
4. Prisma setup
5. Protecting routes with `@Can()`
6. Tenant-aware checks
7. Resource-scoped roles
8. API key recipe
9. Testing utilities
10. Security notes

Docs pages:

- `docs/installation.md`
- `docs/guards.md`
- `docs/prisma.md`
- `docs/testing.md`
- `docs/integrations.md`

Examples:

- `examples/basic-http`
- `examples/api-keys`
- `examples/resource-scoped`

---

## 18. Implementation Milestones

### Milestone 0: Repository Skeleton

- Initialize `package.json`, TypeScript, build, lint, format, and test config.
- Add root package exports.
- Add initial smoke build and smoke test.

Acceptance:

- `npm test` passes.
- `npm run build` emits JS and declarations.

### Milestone 1: Core Engine

- Define public interfaces and error classes.
- Implement permission matcher.
- Implement `InMemoryRbacStorage`.
- Implement storage contract tests.
- Implement `RbacService.can()` and `assertCan()`.
- Implement role, permission, and binding service APIs.

Acceptance:

- In-memory adapter passes contract tests.
- Service tests cover allow, deny, tenant mismatch, resource mismatch, expired binding, and revoked binding.

### Milestone 2: NestJS Integration

- Implement decorators.
- Implement default resolvers.
- Implement `RbacGuard`.
- Implement `RbacModule.forRoot()` and `forRootAsync()`.
- Add E2E test app.

Acceptance:

- Guard handles skip, missing subject, missing tenant, denied permission, and allowed route cases.
- Module works with direct `@UseGuards()` and `APP_GUARD`.

### Milestone 3: Prisma Adapter

- Add Prisma schema example.
- Add SQL migration.
- Implement `PrismaRbacStorage`.
- Run storage contract tests against PostgreSQL.

Acceptance:

- Prisma adapter passes contract tests when database integration tests are enabled.
- If CI lacks PostgreSQL, integration tests are documented and separated from default unit tests.

### Milestone 4: Testing Utilities And Docs

- Add `TestRbacModule`.
- Add `expectAllowed()` and `expectDenied()`.
- Add subject fixtures.
- Expand README and docs pages.

Acceptance:

- README includes a copy-pasteable quickstart and a complete test example.

### Milestone 5: Optional Integrations

- Add tenancy resolver helper.
- Add API key subject resolver helper.
- Add audit logger interface and no-op logger.

Acceptance:

- Optional integrations do not become required dependencies.
- Deny audit event emission is tested without requiring `@nestarc/audit-log`.

---

## 19. Release Criteria

Version `0.1.0` can be released when:

- `RbacModule.forRoot()` and `forRootAsync()` work.
- `@Can()` and `RbacGuard` work in HTTP controllers.
- In-memory adapter passes contract tests.
- Prisma adapter works or is clearly marked beta with documented integration tests.
- Tenant-required fail-closed behavior is tested.
- Resource-scoped role binding behavior is tested.
- Stable error codes are documented.
- README includes complete quickstart.
- Package exports are typed.
- CI runs build, lint, and unit tests.

Version `0.2.0` should target:

- Production-ready Prisma adapter.
- Full docs site page coverage.
- Verified API key and tenancy recipes.
- Audit integration recipe.

---

## 20. Resolved Product Decisions

- Global roles do not apply inside tenants by default.
- Direct subject permissions are not supported in MVP.
- Permission strings use dot notation.
- Role hierarchy is not supported in MVP.
- GraphQL is supported only through custom resolvers in MVP.
- Prisma binding subject type is stored as string for extensibility.
- Tenant-wide unscoped bindings may authorize resource-scoped routes; scoped bindings must match exactly.
- `@Can()` is the preferred documentation decorator; `@RequirePermission()` is an alias.

---

## 21. Security Requirements

- Protected routes deny when subject is missing.
- Tenant-required routes deny when tenant is missing.
- Resource-scoped routes deny when resource cannot be resolved.
- Revoked and expired role bindings are never active.
- Wildcard matching is deterministic and limited to `*` and suffix `.*`.
- No dynamic code evaluation.
- No implicit privilege hierarchy.
- Global roles are opt-in inside tenants.
- Logs do not include full subject attributes or sensitive metadata.
- Service APIs reject empty IDs and invalid permission strings.
