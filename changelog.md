# Changelog

All notable changes to `@nestarc/rbac` will be documented in this file.

## Unreleased

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

### Verification

- Verified lint, typecheck, unit/contract tests, route e2e tests, build,
  coverage, Prisma generation, Prisma migration execution, Docker-backed Prisma
  integration tests, and npm package dry-run.
