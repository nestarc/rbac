# Changelog

All notable changes to `@nestarc/rbac` will be documented in this file.

## Unreleased

### Security

- The default HTTP subject resolver now reconciles every valid
  `request.rbacSubject`, `request.user`, and API-key identity and fails closed when
  their exact subject type, ID, or tenant ID differs. A conflicting or malformed
  populated API-key source can no longer be hidden behind a higher-priority user.
- `request.apiKey` is now the canonical Nestarc API key identity source. RBAC
  fails closed when a populated legacy `request.apiKeyContext` resolves to a
  different key or tenant ID.
- Configured tenant resolvers are now authoritative by default. RBAC denies before
  authorization when the resolver conflicts with the selected subject,
  `request.tenantId`, `request.tenant.id`, or `x-tenant-id`.
- Direct `can()` calls deny conflicting non-null subject/input tenant IDs, including
  attempts to bypass reconciliation with `tenantMode: 'none'`.
- Strict `assignRole()` validation now reconciles subject, binding, and role tenants
  before writing a binding.

### Added

- Added the optional `RbacStorageMutationCapability` and
  `RbacStorage.mutationResults` protocol. It reports committed, idempotent, and
  conflicting outcomes without changing the required 0.2.x custom storage method
  signatures.
- Added a compatibility contract that distinguishes installable peer ranges from
  exact Node, NestJS, Prisma, and Nestarc sibling combinations with verification
  evidence. The strict modern packed consumer now runs on Node 22 and 24.

### Changed

- Aligned the maintainer TypeScript environment with Node 22 by replacing the
  accidental Node 25 type baseline with exact `@types/node` 22.20.1. Release
  publishing remains on Node 24.
- Guard authorization audit is now request-final for stacked class and handler
  requirements. A later denial no longer leaves an earlier allowed event; denied
  events identify the failing requirement index, and fully allowed stacked
  requests emit one aggregate allowed event when allowed-decision logging is
  enabled.
- Built-in storage writes now emit success audit and policy-change events only for
  committed changes. Duplicate create/assignment/grant operations and missing or
  already-applied delete/revoke operations are no-ops without success events.
- `updateRole()` no longer upserts a missing role. The explicit storage-level
  `upsertRole()` contract remains available; missing service updates now throw
  `RbacRoleNotFoundError`.
- An existing role reached through `createRole()` now emits an update event only
  when its requested state changes. Identical create calls do not emit an event.
- Result-less custom storage mutation fallback remains compatible but is
  deprecated for removal no earlier than 0.3. It cannot distinguish adapter
  no-ops, and audit/change delivery remains non-transactional best effort after
  storage commit.
- `RbacService`, `InMemoryRbacStorage`, and `PrismaRbacStorage` now use one
  canonical identifier policy. Leading and trailing whitespace is removed from
  tenant, non-API-key subject, role, binding, resource, and permission identifiers;
  whitespace-only values are rejected. Audit and policy-change events use the same
  canonical values as storage and authorization decisions.
- API-key subject IDs and source tenant IDs remain exact opaque strings at the
  subject boundary. RBAC does not trim, coerce, case-fold, or Unicode-normalize
  those source identity values.
- Non-empty string `request.user.type` values remain supported compatibility
  namespaces in the default resolver; applications that require a fixed `user`
  namespace should configure `subjectResolver`. Subject types remain isolated even
  when their IDs are equal.
- Invalid runtime permission/tenant modes and malformed `can()` or Guard
  subject, resource, requirement, and non-finite `Date` shapes now fail closed
  with `RBAC_CONFIG_ERROR` instead of falling back to permissive defaults or
  leaking incidental JavaScript errors. Invalid values returned by subject and
  resource resolvers keep their existing authentication/authorization denial.
- Matching canonical and legacy API key values now select `request.apiKey` instead
  of the formerly documented legacy-first precedence. API key and tenant IDs are
  treated as exact opaque strings without trimming, normalization, case folding,
  or number coercion.
- `request.apiKeyContext` is deprecated and remains a fallback only when
  `request.apiKey` is absent. Custom middleware should migrate its writer to
  `request.apiKey` before the next breaking minor release (`0.3.0` at the earliest).
- Added the deprecated `tenant.resolverMode: 'legacy-fallback'` opt-in for consumers
  that temporarily need the pre-hardening default-first resolver precedence.
- Tenant source conflicts emit only the `tenant_source_conflict` audit category;
  raw request headers and subject attributes are not included.

## 0.2.1 - 2026-08-30

Prisma 7 compatibility release for the NestJS 11 ecosystem lane.

### Added

- Added an adapter-backed Prisma 7.10.0 PostgreSQL 16 contract-test fixture.
- Added an exact Prisma 6.19.3 PostgreSQL regression lane for the retained legacy
  client contract.
- Added a fresh packed-consumer gate that strictly installs exact NestJS 11.2.1
  and Prisma 7.10.0, then verifies CommonJS, ESM, and TypeScript declarations.
- Added Prisma 7 generator, `prisma.config.ts`, and PostgreSQL driver-adapter
  setup guidance.

### Changed

- Expanded optional `@prisma/client` and `prisma` peer support from Prisma 5/6
  to Prisma 5/6/7.
- Pinned the repository's modern validation toolchain to NestJS 11.2.1 and
  Prisma 7.10.0 and made both strict-consumer and real-database checks CI and
  release gates.

## 0.2.0 - 2026-06-20

Safety and operability release for production NestJS SaaS authorization.

### Added

- Added `defineRbacPermissions()` for opt-in typed permission contracts.
- Added `createStrictRbacOptions()` for fail-closed RBAC module defaults.
- Added optional `RbacDecision.details` for safe server-side decision tracing.
- Added write validation options for tenant mismatch and resource binding checks.
- Added policy change publisher hooks for role, permission, and binding mutations.
- Added `@nestarc/rbac/integrations/audit-log` with `createAuditLogRbacLogger()`.
- Added testing helpers: `expectDeniedReason()`, `createRbacScenario()`, and
  `expectRbacMatrix()`.
- Added `docs/spec-0.2.0.md` and `docs/migration-0.2.0.md`.

### Changed

- RBAC guard audit metadata now includes safe decision details when available.
- Package exports and build entries now include the audit-log integration subpath.
- README, integration docs, and testing docs now cover 0.2.0 APIs.

### Fixed

- Default HTTP denial responses continue to omit decision details.
- Audit-log adapter metadata sanitization removes secret-shaped fields.

## 0.1.0 - 2026-06-03

Initial public release of tenant-aware RBAC primitives for NestJS SaaS
applications.

### Added

- Added optional Prisma/PostgreSQL persistence through `@nestarc/rbac/prisma`.
- Added `PrismaRbacStorage`, a Prisma-compatible implementation of the existing
  `RbacStorage` contract.
- Added `prisma/schema.prisma.example` and
  `prisma/migrations/0001_init_rbac.sql` for consuming applications.
- Added Docker-backed Prisma integration tests and a dedicated `test:prisma`
  script.
- Added public testing helpers through `@nestarc/rbac/testing`, including
  `TestRbacModule`, `expectAllowed()`, `expectDenied()`, `rbacUser()`,
  `rbacApiKey()`, and `rbacServiceAccount()`.
- Added optional integration helper subpaths:
  `@nestarc/rbac/integrations/tenancy` and
  `@nestarc/rbac/integrations/api-keys`.
- Added `NoopRbacAuditLogger` and audit event emission for RBAC write operations
  and denied guard decisions.
- Added `tenant.allowGlobalRolesInTenant` support for explicitly opting global
  roles into tenant-scoped checks.

### Changed

- Expanded package exports to include Prisma, testing, and optional integration
  subpaths.
- Marked Prisma, tenancy, API key, and audit-log packages as optional peers so
  the root package remains dependency-light.
- Updated build output to emit multi-entry ESM, CJS, and type declarations.
- Updated package contents to include public docs, examples, and Prisma setup
  files in the npm tarball.
- Changed configured tenant resolvers to run as the final fallback after default
  HTTP tenant sources.

### Fixed

- Tenant-required authorization now treats an explicit `tenantId: null` as a
  missing tenant unless the route/service check is explicitly global with
  `tenantMode: 'none'`.
- Service write APIs now reject empty tenant, subject, role, binding, and
  resource identifiers before storage writes.
- Service write APIs now reject invalid permission strings before storage writes.
- Prisma migration semantics were aligned with the storage contract for
  timestamp precision, default update timestamps, role-key uniqueness, and
  expired binding reactivation behavior.
- Prisma storage now handles concurrent role creation and role assignment retry
  paths for unique constraint races.
- Prisma metadata JSON handling now preserves `Date` values and avoids marker
  collisions.

### Documentation

- Expanded `README.md` with installation, quickstart, guard, tenant, resource,
  Prisma, API key, testing, and security guidance.
- Added focused docs for installation, guards, Prisma setup, testing utilities,
  and optional integrations.
- Added examples for basic HTTP guards, API key subjects, and resource-scoped
  roles.
