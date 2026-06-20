# Technical Spec: `@nestarc/rbac` 0.2.0

**Status:** Draft for implementation planning  
**Date:** 2026-06-20  
**Source:** `docs/spec.md`, `docs/prd.md`, repository audit, external ecosystem research  
**Package:** `@nestarc/rbac`

---

## 1. Purpose

`@nestarc/rbac` 0.2.0 should turn the 0.1.0 RBAC core into a safer, more operable NestJS SaaS authorization layer.

The release should preserve the current value proposition:

- Authentication stays outside this package.
- RBAC evaluates an already-identified subject.
- Tenant, global, and resource-scoped role bindings remain the core model.
- Prisma/PostgreSQL and in-memory storage remain first-class.
- Policy engines such as OPA, Casbin, CASL, Cerbos, OpenFGA, and SpiceDB remain integrations or alternatives, not embedded replacements.

The 0.2.0 release should focus on three outcomes:

1. Make permission declarations harder to misspell or drift.
2. Make authorization failures easier to debug and audit without exposing sensitive data.
3. Make the package easier to operate in Nestarc-style SaaS applications with tenancy, API keys, audit logging, and cache invalidation needs.

---

## 2. Evidence And Terminology

### 2.1 Evidence Classes

This spec uses the following evidence classes:

- **Code fact:** verified from this repository.
- **External fact:** verified from public documentation, package metadata, or public community signals.
- **Recommendation:** proposed product or technical direction inferred from code facts and external facts.

### 2.2 Current Baseline

Code facts:

- The package is currently `@nestarc/rbac` version `0.1.0`.
- Public exports include root APIs plus `./prisma`, `./testing`, `./integrations/tenancy`, and `./integrations/api-keys`.
- `RbacService` supports subject, tenant, role, permission, resource, and storage-backed decisions.
- `RbacGuard` reads RBAC metadata and maps denied decisions to HTTP exceptions.
- Storage adapters exist for in-memory and Prisma/PostgreSQL.
- Audit hooks exist through `RbacAuditLogger`, but there is no concrete `@nestarc/audit-log` adapter.
- Test utilities exist under `@nestarc/rbac/testing`.
- Basic test verification passed during research: 11 test files and 184 tests passed with `npm test`.

Key files:

- Package metadata: [`../package.json`](../package.json)
- Current technical spec: [`spec.md`](spec.md)
- Product requirements: [`prd.md`](prd.md)
- Service: [`../src/rbac.service.ts`](../src/rbac.service.ts)
- Guard: [`../src/rbac.guard.ts`](../src/rbac.guard.ts)
- Decision types: [`../src/interfaces/decision.ts`](../src/interfaces/decision.ts)
- Module options: [`../src/interfaces/module-options.ts`](../src/interfaces/module-options.ts)
- Storage contract: [`../src/interfaces/storage.ts`](../src/interfaces/storage.ts)
- Testing utilities: [`../src/testing.ts`](../src/testing.ts)

### 2.3 External Context

External facts:

- NestJS documents authorization as separate from authentication and shows guard/decorator-based RBAC patterns: <https://docs.nestjs.com/security/authorization>.
- OWASP recommends deny-by-default and validating authorization on every request: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>.
- OWASP logging guidance warns against logging tokens, secrets, and sensitive personal data: <https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>.
- Casbin, OPA, Cerbos, OpenFGA, SpiceDB, and Oso show demand for stronger policy systems, but they also introduce policy DSLs, PDPs, external services, or graph models.
- NestJS community questions and GitHub issues repeatedly surface guard ordering, role-vs-permission design, organization-scoped roles, testing difficulty, auditability, and stale permission/cache invalidation.

Recommendation:

`@nestarc/rbac` 0.2.0 should not compete by becoming a general policy engine. It should compete by being the production-ready NestJS RBAC layer teams reach for before they need OPA, OpenFGA, or SpiceDB.

---

## 3. Release Principles

### 3.1 Compatibility

0.2.0 should remain source-compatible with 0.1.0 where practical.

Rules:

- Existing string permissions must continue to work.
- Existing decorators must continue to accept plain strings.
- Existing storage adapters must not require a breaking schema migration.
- Existing `RbacModuleOptions` defaults must not silently become stricter.
- New safety behavior should be opt-in through explicit options or helper presets.

### 3.2 Security Posture

0.2.0 should provide a clear strict path without forcing all existing consumers onto it.

Rules:

- Default behavior remains compatible.
- Strict mode should be fail-closed.
- Tenant-bound decisions should not apply global roles inside tenant contexts unless explicitly enabled.
- Missing declared resources should deny.
- Storage errors should deny by default unless the application chooses `storageErrors: 'throw'`.
- Client-facing errors should avoid leaking the full permission model.
- Audit and debug details must not include raw subject attributes by default.

### 3.3 Scope Discipline

0.2.0 should strengthen the current RBAC model rather than add a new authorization model.

In scope:

- Typed permission contracts.
- Strict configuration presets.
- Richer internal decision details.
- Audit-log integration.
- Change-event hooks for cache invalidation.
- Testing utilities and examples.

Out of scope:

- Full ABAC expression DSL.
- ReBAC graph traversal.
- OPA/Rego, Casbin model, or CASL ability compatibility layers.
- Admin UI.
- Distributed cache implementation.
- Row-level query filtering generation.
- Complex organization/team inheritance.

---

## 4. Proposed 0.2.0 Scope

### 4.1 Must Have

1. Type-safe permission contract.
2. Strict authorization preset.
3. Decision result and denial reason v2.
4. Tenant boundary hardening for write APIs.
5. Official `@nestarc/audit-log` adapter.
6. Documentation and examples for strict operation.

### 4.2 Should Have

1. Policy change events and cache invalidation hooks.
2. Testing utilities v2 for permission matrices and denial reasons.
3. End-to-end Nestarc recipe: tenancy + API keys + RBAC + audit log.
4. Migration guide from 0.1.x to 0.2.0.

### 4.3 Could Have

1. OpenAPI/Swagger metadata helpers.
2. Permission contract seed helpers.
3. Narrow policy extension hooks that do not replace RBAC semantics.

### 4.4 Not Now

1. Explicit deny rules or deny assignments.
2. Role hierarchy.
3. Condition expressions or full ABAC.
4. ReBAC graph modeling.
5. Built-in Redis, queue, broker, or distributed cache implementation.
6. Admin UI or management API controllers.
7. Billing, entitlement, plan, or quota logic.

---

## 5. Feature 1: Type-Safe Permission Contract

### 5.1 Problem

Current permissions are plain strings. This is flexible but allows typos such as `reports.raed` to compile and fail only at runtime.

### 5.2 Goals

- Provide opt-in compile-time permission literals.
- Keep existing string-based APIs working.
- Support permission namespaces and metadata for docs/seeding.
- Avoid requiring a runtime registry for all users.

### 5.3 Non-Goals

- No breaking change to `@Can('permission.key')`.
- No global singleton registry.
- No code generation requirement.
- No implicit permission hierarchy.

### 5.4 Proposed API

```ts
import { defineRbacPermissions } from '@nestarc/rbac';

export const permissions = defineRbacPermissions({
  reports: {
    read: 'reports.read',
    export: 'reports.export',
  },
  projects: {
    inviteMember: 'project.member.invite',
  },
});

export type AppPermission = typeof permissions.$permission;
```

Decorators and service checks should continue to accept `string`, but typed projects can narrow through generics or typed helpers:

```ts
@Can(permissions.reports.read, { tenant: 'required' })
readReport() {}

await rbac.can<AppPermission>({
  subject,
  tenantId,
  tenantMode: 'required',
  permission: permissions.reports.export,
});
```

Optional metadata:

```ts
export const permissionContract = defineRbacPermissions({
  'reports.read': {
    description: 'Read report summaries and details.',
    owner: 'reports',
  },
  'reports.export': {
    description: 'Export reports.',
    owner: 'reports',
    risk: 'sensitive',
  },
});
```

The implementation may support both nested object and flat object input if the type surface remains understandable.

### 5.5 Required Behavior

- Duplicate permission values should be rejected when runtime validation is requested.
- Permission keys should be preserved as string literals.
- Existing decorators should require no migration.
- Typed helpers should be additive exports from the root package.
- Documentation should recommend dot notation and package/domain prefixes.

### 5.6 Implementation Notes

Likely files:

- `src/interfaces/permission.ts`
- `src/decorators/permission.decorator.ts`
- `src/interfaces/decision.ts`
- `src/rbac.service.ts`
- `src/index.ts`
- `docs/spec-0.2.0.md`
- `README.md`

### 5.7 Tests

Required tests:

- Permission contract preserves literal types.
- Duplicate runtime validation rejects duplicate values.
- `@Can()` continues to accept plain strings.
- `rbac.can()` continues to accept plain strings.
- Typed examples compile.

Recommended test style:

- Type-level compile tests using the existing test toolchain if possible.
- Runtime unit tests for validation helpers.

---

## 6. Feature 2: Strict Authorization Preset

### 6.1 Problem

The current defaults are intentionally compatible and approachable. In production SaaS apps, teams often want stricter fail-closed behavior:

- Missing RBAC metadata should deny.
- Missing tenant should deny by default.
- Global roles should not apply inside tenant contexts.
- Storage errors should not accidentally allow access.

### 6.2 Goals

- Provide a one-line strict preset.
- Avoid changing current defaults.
- Make secure global guard setup easy to copy.
- Make strict behavior visible in tests.

### 6.3 Proposed API

Option A:

```ts
RbacModule.forRoot({
  storage,
  mode: 'strict',
});
```

Option B:

```ts
import { createStrictRbacOptions } from '@nestarc/rbac';

RbacModule.forRoot(createStrictRbacOptions({
  storage,
}));
```

Recommendation:

Use Option B first if `mode` would make option merging ambiguous. A helper can be fully additive and avoids complicating existing `RbacModuleOptions`.

### 6.4 Strict Defaults

Strict options should expand to:

```ts
{
  requireMetadata: true,
  tenant: {
    requiredByDefault: true,
    allowGlobalRolesInTenant: false,
  },
  storageErrors: 'deny',
  logAllowedDecisions: false,
}
```

The helper should preserve explicit overrides:

```ts
createStrictRbacOptions({
  storage,
  tenant: {
    requiredByDefault: false,
  },
});
```

### 6.5 Required Behavior

- Strict mode must deny routes with no RBAC metadata unless `@SkipRbac()` is present.
- Strict mode must deny protected routes with no tenant when tenant mode is defaulted.
- Strict mode must not apply global roles inside tenant checks unless explicitly overridden.
- Strict mode must not expose detailed denial internals in HTTP responses by default.

### 6.6 Tests

Required tests:

- Route without metadata denies under strict preset.
- `@SkipRbac()` still allows under strict preset.
- Missing tenant denies under strict preset.
- Existing non-strict defaults remain unchanged.
- Explicit overrides are respected.

---

## 7. Feature 3: Decision Result And Denial Reason V2

### 7.1 Problem

Current decisions include `allowed` and a reason enum. That is useful for tests, but not enough for production debugging and audit workflows. Operators need to answer:

- Which permission or role was required?
- Which permission or role matched?
- Was the tenant missing, mismatched, or optional?
- Was a resource missing or mismatched?
- Did storage fail?

At the same time, client responses must not expose sensitive permission topology.

### 7.2 Goals

- Add structured decision details for server-side use.
- Keep HTTP error bodies safe by default.
- Make every deny path produce a stable denial reason.
- Improve audit event quality.
- Preserve current `RbacDecision` compatibility.

### 7.3 Proposed Types

```ts
export interface RbacDecision {
  allowed: boolean;
  reason?: RbacDecisionReason;
  subject?: RbacSubject;
  tenantId?: string | null;
  resource?: RbacResourceRef;
  details?: RbacDecisionDetails;
}

export interface RbacDecisionDetails {
  requirement?: RbacDecisionRequirementDetails;
  matched?: RbacDecisionMatchDetails;
  missing?: RbacDecisionMissingDetails;
  evaluationPath?: RbacEvaluationStep[];
  safeMessage?: string;
}

export interface RbacDecisionRequirementDetails {
  type: 'permission' | 'role';
  permissions?: string[];
  roleKeys?: string[];
  mode?: 'any' | 'all';
}

export interface RbacDecisionMatchDetails {
  roleIds?: string[];
  roleKeys?: string[];
  permissions?: string[];
  bindingIds?: string[];
}

export interface RbacDecisionMissingDetails {
  subject?: boolean;
  tenant?: boolean;
  resource?: boolean;
  permissions?: string[];
  roleKeys?: string[];
}

export interface RbacEvaluationStep {
  code:
    | 'subject_resolved'
    | 'tenant_resolved'
    | 'resource_resolved'
    | 'roles_loaded'
    | 'permissions_loaded'
    | 'permission_matched'
    | 'permission_missing'
    | 'role_matched'
    | 'role_missing'
    | 'storage_error';
  outcome: 'allow' | 'deny' | 'skip' | 'info';
}
```

### 7.4 Required Behavior

- Existing consumers reading `allowed` and `reason` must keep working.
- `details` must be optional and safe to omit.
- `details.safeMessage` must be suitable for logs, not necessarily for clients.
- `subject.attributes` must not be copied into decision details by default.
- Binding IDs may be included for server-side traceability, but this must not be exposed through default HTTP errors.

### 7.5 HTTP Exposure

Default HTTP error response should remain minimal:

```json
{
  "statusCode": 403,
  "message": "Forbidden",
  "error": "RBAC_PERMISSION_DENIED"
}
```

Optional debug exposure may be considered only behind an explicit option:

```ts
RbacModule.forRoot({
  storage,
  exposeDecisionDetails: false,
});
```

Recommendation:

Do not add client detail exposure in 0.2.0 unless there is a clear consumer. Keep detailed decisions server-side.

### 7.6 Tests

Required tests:

- Every deny path includes stable `reason`.
- Permission deny includes required and missing permission details.
- Role deny includes required and missing role details.
- Missing tenant and missing resource populate `missing`.
- HTTP errors do not expose internal decision details by default.
- Audit events can receive safe decision details.

---

## 8. Feature 4: Tenant Boundary Hardening

### 8.1 Problem

Current evaluation is tenant-aware and fail-closed in important paths. However, write-time APIs can still permit invalid or confusing state unless validation is tightened. For example, a tenant-scoped role should not be assigned under a different tenant.

### 8.2 Goals

- Reject tenant mismatch at write time when strict write validation is enabled.
- Preserve compatibility for existing data.
- Make global role behavior explicit.
- Reduce production data corruption and ambiguous decisions.

### 8.3 Proposed Option

```ts
export interface RbacModuleOptions {
  writeValidation?: {
    rejectTenantMismatch?: boolean;
    rejectResourceWithoutTenant?: boolean;
    rejectGlobalRoleInTenantBinding?: boolean;
  };
}
```

Strict preset should set:

```ts
writeValidation: {
  rejectTenantMismatch: true,
  rejectResourceWithoutTenant: true,
  rejectGlobalRoleInTenantBinding: false,
}
```

`rejectGlobalRoleInTenantBinding` should default to `false` because some applications may intentionally bind global roles in tenant contexts while still disabling evaluation of global roles inside tenant checks.

### 8.4 Required Behavior

- Assigning a role with `role.tenantId = tenant_a` under `tenant_b` should reject when `rejectTenantMismatch` is true.
- Assigning a resource-scoped binding without tenant should reject when `rejectResourceWithoutTenant` is true.
- Assigning a global role under a tenant should remain allowed unless `rejectGlobalRoleInTenantBinding` is true.
- Error messages should be stable and typed.

### 8.5 Tests

Required tests:

- Tenant role assigned inside same tenant succeeds.
- Tenant role assigned inside another tenant rejects under strict write validation.
- Global role assignment behavior follows option.
- Resource binding without tenant rejects under strict write validation.
- Non-strict behavior remains compatible.

---

## 9. Feature 5: `@nestarc/audit-log` Adapter

### 9.1 Problem

The package exposes `RbacAuditLogger`, and docs show integration patterns, but there is no official adapter for `@nestarc/audit-log`. This weakens the Nestarc ecosystem story.

### 9.2 Goals

- Provide a small optional integration subpath.
- Keep `@nestarc/audit-log` optional.
- Map RBAC events to safe audit events.
- Preserve current behavior that audit failures do not block authorization.

### 9.3 Proposed Export

New subpath:

```json
{
  "./integrations/audit-log": {
    "types": "./dist/integrations/audit-log.d.ts",
    "import": "./dist/integrations/audit-log.mjs",
    "require": "./dist/integrations/audit-log.cjs"
  }
}
```

API:

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

### 9.4 Event Mapping

RBAC events should map to audit actions such as:

- `rbac.role.created`
- `rbac.role.updated`
- `rbac.role.deleted`
- `rbac.permission.granted`
- `rbac.permission.revoked`
- `rbac.role.assigned`
- `rbac.role.revoked`
- `rbac.permission.allowed`
- `rbac.permission.denied`

Audit payload rules:

- Include subject type and subject ID.
- Include tenant ID when present.
- Include resource reference when present.
- Include required permissions or role keys.
- Include denial reason.
- Do not include raw subject attributes by default.
- Do not include tokens, API key secrets, request headers, or full request bodies.

### 9.5 Tests

Required tests:

- Adapter maps every RBAC audit event type.
- Deny events include reason and safe requirement details.
- Subject attributes are omitted by default.
- Adapter failure does not block RBAC decisions.
- Subpath import works without forcing `@nestarc/audit-log` on root consumers.

---

## 10. Feature 6: Policy Change Events And Cache Invalidation Hooks

### 10.1 Problem

Production apps often cache permission decisions or effective permissions outside `@nestarc/rbac`. Current mutation APIs emit audit events, but audit events should not double as cache invalidation events.

### 10.2 Goals

- Emit typed change events for RBAC mutations.
- Allow consumers to invalidate caches, publish outbox events, or refresh local state.
- Avoid promising distributed consistency.
- Avoid adding Redis, queue, broker, or watcher dependencies.

### 10.3 Proposed Types

```ts
export type RbacPolicyChangeEventType =
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'permission.granted'
  | 'permission.revoked'
  | 'role.assigned'
  | 'role.revoked';

export interface RbacPolicyChangeEvent {
  type: RbacPolicyChangeEventType;
  occurredAt: Date;
  tenantId?: string | null;
  subject?: Pick<RbacSubject, 'type' | 'id'>;
  roleId?: string;
  roleKey?: string;
  permissions?: string[];
  resource?: RbacResourceRef;
  bindingId?: string;
  metadata?: Record<string, unknown>;
}

export interface RbacPolicyChangePublisher {
  publish(event: RbacPolicyChangeEvent): void | Promise<void>;
}
```

Module option:

```ts
export interface RbacModuleOptions {
  changePublisher?: RbacPolicyChangePublisher;
}
```

### 10.4 Required Behavior

- Every write mutation should publish a change event after storage succeeds.
- Change publisher failures should not change the stored RBAC mutation result by default.
- Events should be best-effort and at-least-once from the package perspective.
- Events should be separate from audit events.
- Docs must clearly state that the package does not provide distributed cache invalidation.

### 10.5 Tests

Required tests:

- `createRole`, `updateRole`, `deleteRole` publish expected events.
- `grantPermission`, `revokePermission` publish expected events.
- `assignRole`, `revokeRole` publish expected events.
- Failed storage writes do not publish change events.
- Failed publisher calls are handled consistently and documented.

---

## 11. Feature 7: Testing Utilities V2

### 11.1 Problem

Existing test helpers make single allow/deny assertions easier. Application teams still need to test full permission matrices across roles, tenants, resources, subjects, and denial reasons.

### 11.2 Goals

- Provide compact permission matrix tests.
- Make denial reason assertions first-class.
- Support typed permission contracts.
- Keep helpers independent from external auth providers.

### 11.3 Proposed API

```ts
import {
  createRbacScenario,
  expectRbacMatrix,
  expectDeniedReason,
} from '@nestarc/rbac/testing';

const scenario = await createRbacScenario({
  roles: [
    {
      tenantId: 'tenant_1',
      key: 'viewer',
      permissions: ['reports.read'],
    },
  ],
  bindings: [
    {
      tenantId: 'tenant_1',
      subject: rbacUser('user_1'),
      roleKey: 'viewer',
    },
  ],
});

await expectRbacMatrix(scenario.rbac, [
  {
    subject: rbacUser('user_1'),
    tenantId: 'tenant_1',
    permission: 'reports.read',
    allowed: true,
  },
  {
    subject: rbacUser('user_1'),
    tenantId: 'tenant_1',
    permission: 'reports.export',
    allowed: false,
    reason: 'denied_no_matching_permission',
  },
]);
```

### 11.4 Required Behavior

- Matrix failures should show subject, tenant, resource, permission, expected decision, and actual decision.
- Helpers should work with in-memory storage by default.
- Helpers should not require Nest application bootstrap unless specifically testing guards.
- Existing `expectAllowed` and `expectDenied` remain supported.

### 11.5 Tests

Required tests:

- Matrix helper reports allowed and denied cases.
- Matrix helper includes useful failure output.
- `expectDeniedReason` checks stable denial reason.
- Typed permission contracts can be used in matrix input.

---

## 12. Feature 8: Documentation And Examples

### 12.1 Problem

0.1.0 already has useful docs, but 0.2.0 introduces safety and operation concepts that should be documented as first-class usage paths.

### 12.2 Required Docs

Update or add:

- `README.md`: short 0.2.0 feature summary.
- `docs/installation.md`: optional peer notes for audit-log integration.
- `docs/guards.md`: strict global guard recipe and guard ordering with auth guard.
- `docs/integrations.md`: tenancy, API keys, audit-log, and change events.
- `docs/testing.md`: matrix helper and denial reason examples.
- `docs/prisma.md`: migration compatibility and no breaking schema note.
- `docs/spec-0.2.0.md`: this planning spec.
- `docs/migration-0.2.0.md`: 0.1.x to 0.2.0 migration guide.

### 12.3 Required Examples

Add or update examples:

- `examples/strict-http`: strict mode with global `APP_GUARD`.
- `examples/api-keys`: API key subject resolved before RBAC guard.
- `examples/resource-scoped`: project-scoped role binding and route resource resolver.
- `examples/nestarc-stack`: tenancy + API keys + RBAC + audit-log recipe.

### 12.4 Required Guidance

Docs must explicitly state:

- This package does not authenticate.
- JWT claims may identify the subject but should not be treated as the sole source of app-domain authorization.
- Tenant context must come from trusted auth or tenancy middleware.
- `x-tenant-id` style headers are only safe when validated against the authenticated subject.
- Global roles do not apply inside tenants by default.
- Resource ID resolution failure denies.
- Audit logs must not include tokens, API key secrets, or raw subject attributes.
- Distributed cache invalidation is not built in.

---

## 13. Feature 9: OpenAPI Metadata Helpers

### 13.1 Status

This is a could-have feature for 0.2.0. It should not block the release.

### 13.2 Problem

RBAC metadata is useful for API docs and review, but current decorators only store Nest reflection metadata.

### 13.3 Proposed Direction

Provide an optional helper that converts route RBAC metadata into OpenAPI vendor extensions:

```json
{
  "x-rbac-permissions": ["reports.read"],
  "x-rbac-mode": "all",
  "x-rbac-tenant": "required",
  "x-rbac-resource": {
    "type": "project",
    "source": "param",
    "name": "projectId"
  }
}
```

### 13.4 Constraints

- Do not add `@nestjs/swagger` as a required runtime dependency.
- Prefer an optional subpath if implementation requires Swagger types.
- Do not expose subject internals or role binding data in OpenAPI.

---

## 14. Narrow Policy Extension Hooks

### 14.1 Status

This is a could-have feature. It should be considered only if the must-have work is complete.

### 14.2 Problem

Some applications need small local checks around RBAC decisions:

- feature flag gates,
- break-glass checks,
- account suspension,
- ownership prechecks,
- environment restrictions.

### 14.3 Proposed Direction

If added, hooks should be narrow and explicit:

```ts
export interface RbacDecisionHook {
  beforeDecision?(input: RbacCanInput): void | Promise<void>;
  afterDecision?(input: RbacCanInput, decision: RbacDecision): void | Promise<void>;
}
```

Do not add a general expression engine.

### 14.4 Constraints

- Hooks must not silently override RBAC decisions in 0.2.0.
- Hook errors should follow documented failure behavior.
- Audit reason should preserve the RBAC decision, not a hidden hook policy.

---

## 15. Public API Summary

0.2.0 should consider adding:

```ts
// Root exports
defineRbacPermissions
createStrictRbacOptions

// Interfaces
RbacDecisionDetails
RbacDecisionRequirementDetails
RbacDecisionMatchDetails
RbacDecisionMissingDetails
RbacEvaluationStep
RbacPolicyChangeEvent
RbacPolicyChangePublisher

// Testing exports
createRbacScenario
expectRbacMatrix
expectDeniedReason

// Integration subpath
createAuditLogRbacLogger
```

0.2.0 should avoid removing or renaming:

```ts
RbacModule
RbacGuard
RbacService
Can
RequirePermission
RequirePermissions
RequireRole
SkipRbac
CurrentRbacSubject
InMemoryRbacStorage
PrismaRbacStorage
TestRbacModule
expectAllowed
expectDenied
```

---

## 16. Migration Guide Requirements

The 0.2.0 migration guide should include three paths.

### 16.1 No-Change Upgrade

For users who want compatibility:

```bash
npm install @nestarc/rbac@0.2
```

Expected behavior:

- Existing string permissions work.
- Existing module options work.
- Existing Prisma schema remains valid.
- Existing tests should pass unless they assert exact decision object shape and the shape is extended.

### 16.2 Adopt Typed Permissions

Steps:

1. Create `permissions.ts`.
2. Replace literal strings incrementally.
3. Keep persisted permission values unchanged.
4. Add compile or unit tests for the permission contract.

### 16.3 Adopt Strict Mode

Steps:

1. Add `createStrictRbacOptions`.
2. Mark public routes with `@SkipRbac()`.
3. Add RBAC metadata to every protected route.
4. Confirm tenant resolution before RBAC guard runs.
5. Add denial reason tests for missing tenant and missing metadata.

---

## 17. Security And Privacy Requirements

### 17.1 Deny-By-Default Path

Strict mode must support deny-by-default for route authorization.

Required deny cases:

- no subject,
- missing required tenant,
- missing declared resource,
- no matching role,
- no matching permission,
- inactive binding,
- expired binding,
- revoked binding,
- storage error when `storageErrors` is `deny`.

### 17.2 Tenant Isolation

Rules:

- Tenant checks must not apply bindings from another tenant.
- Global roles must not apply inside tenant contexts unless explicitly enabled.
- Resource-scoped bindings must require exact resource match.
- Tenant mismatch in write APIs should be rejected under strict write validation.

### 17.3 Audit Safety

Audit logs must not include by default:

- raw subject attributes,
- JWTs,
- session tokens,
- API key secrets,
- passwords,
- request headers,
- request bodies,
- unnecessary personal data.

Audit logs may include:

- subject type,
- subject ID,
- tenant ID,
- resource type and ID,
- role key or role ID,
- required permission,
- decision reason,
- event timestamp.

### 17.4 Legal Review Flags

Before marketing audit features as compliance features, review:

- retention defaults,
- deletion requirements,
- access controls on audit logs,
- cross-border transfer implications,
- employee monitoring implications,
- non-repudiation claims.

---

## 18. Test Plan

### 18.1 Unit Tests

Required:

- permission contract helper,
- strict options helper,
- decision details builder,
- tenant write validation,
- change event publisher behavior,
- audit-log adapter mapping,
- testing matrix helper.

### 18.2 Guard Tests

Required:

- route without metadata in strict mode denies,
- `@SkipRbac()` allows in strict mode,
- auth guard ordering examples remain documented,
- missing resource denies,
- HTTP response does not expose decision details by default.

### 18.3 Service Tests

Required:

- no subject denies,
- missing tenant denies,
- cross-tenant binding denies,
- global role in tenant follows option,
- exact permission match,
- suffix wildcard match,
- global wildcard match,
- expired binding denies,
- revoked binding denies,
- storage error behavior.

### 18.4 Storage Contract Tests

Required:

- existing contract tests continue to pass for in-memory and Prisma.
- new write validation should be tested at service level, not duplicated in every adapter unless adapter behavior changes.
- no breaking Prisma migration should be required for must-have features.

### 18.5 Integration Tests

Required if dependencies are available:

- audit-log adapter maps events into `@nestarc/audit-log`.
- tenancy resolver and API key resolver work in one request flow.
- strict HTTP example works through Nest testing module.

### 18.6 Documentation Verification

Required:

- examples compile or are smoke-tested.
- README snippets match exported APIs.
- migration guide does not instruct users to change persisted permission values.

---

## 19. Release Checklist

Before releasing 0.2.0:

- Run unit and e2e tests.
- Run Prisma integration tests when a database URL is available.
- Run build and package export checks.
- Verify root and subpath exports.
- Verify package tarball contains docs, examples, Prisma assets, and new integration subpath.
- Review README and migration guide.
- Review audit payloads for sensitive data.
- Confirm no new required peer dependency was introduced for optional integrations.

---

## 20. Open Questions

1. Should `createStrictRbacOptions()` be the only strict entrypoint, or should `mode: 'strict'` also be added?
2. Should `RbacDecision.details` be enabled for all decisions, or only when an option is enabled?
3. Should binding IDs appear in decision details by default?
4. What is the canonical Nestarc permission namespace format: `resource.action` or `package.resource.action`?
5. Should `@nestarc/audit-log` adapter depend on a stable public audit-log interface or a structural logger type?
6. Should change publisher failures be swallowed like audit failures, or should there be an option to throw?
7. Should OpenAPI helpers ship in 0.2.0 or wait for 0.3.0?
8. Should strict write validation be part of strict mode by default?

---

## 21. Final Recommendation

0.2.0 should ship a focused safety and operability release:

1. **Permission contracts** to make permission declarations reliable.
2. **Strict mode and decision details** to make route authorization safer and easier to debug.
3. **Audit-log and change-event integrations** to make RBAC operational in Nestarc SaaS stacks.
4. **Testing and documentation upgrades** to make adoption repeatable.

Do not add role hierarchy, explicit deny, ABAC, ReBAC, admin UI, or distributed cache implementation in 0.2.0. Those features are real opportunities, but adding them now would blur the package's strongest position: a small, Nest-native, tenant-aware RBAC layer that is easier to adopt than a general policy engine.
