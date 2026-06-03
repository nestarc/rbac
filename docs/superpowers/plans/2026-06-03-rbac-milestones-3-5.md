# RBAC Milestones 3-5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete `@nestarc/rbac` Milestones 3-5: Prisma/PostgreSQL storage, public testing utilities, full README/docs/examples, optional tenancy/API-key integration helpers, and audit event emission.

**Architecture:** Keep the existing Milestone 0-2 core stable and add optional capabilities through subpath exports. Prisma storage lives behind the existing `RbacStorage` contract and accepts a Prisma-client-like object so consumers are not coupled to generated package types. Testing and integration helpers are exported from isolated subpaths so optional peer packages never become runtime requirements for the root package.

**Tech Stack:** TypeScript, NestJS, Prisma-compatible client, PostgreSQL, tsup multi-entry build, vitest unit/contract/integration tests, Docker-backed PostgreSQL for optional Prisma verification, Markdown docs and examples.

---

## Scope

This plan implements `docs/spec.md` Milestones 3, 4, and 5, plus the small carry-over gaps discovered during the Milestone 0-2 completion review that directly affect Milestone 3-5 release readiness.

Included:

- Prisma schema example and PostgreSQL SQL migration.
- `PrismaRbacStorage` that implements the existing `RbacStorage` contract.
- Prisma integration tests separated from default unit/e2e runs.
- Package subpath exports for `@nestarc/rbac/prisma`, `@nestarc/rbac/testing`, `@nestarc/rbac/integrations/tenancy`, and `@nestarc/rbac/integrations/api-keys`.
- Public testing helpers: `TestRbacModule`, `expectAllowed()`, `expectDenied()`, and subject fixtures.
- README expansion plus `docs/installation.md`, `docs/guards.md`, `docs/prisma.md`, `docs/testing.md`, and `docs/integrations.md`.
- Examples: `examples/basic-http`, `examples/api-keys`, and `examples/resource-scoped`.
- Optional tenancy resolver helper and API key subject resolver helper.
- No-op audit logger plus tested audit event emission for deny decisions and RBAC write operations.
- `tenant.allowGlobalRolesInTenant` evaluation support, because Prisma and integration docs depend on the option behaving as specified.

Excluded:

- Auth/session/JWT/login flows.
- Admin UI or frontend SDK.
- Production hosting, docs site generation, or package publishing.
- OPA/Casbin/CASL compatibility.

---

## Current State Summary

Already implemented:

- Root package build/test/lint/typecheck setup.
- `RbacModule.forRoot()` and `RbacModule.forRootAsync()`.
- Decorators, default HTTP resolvers, `RbacGuard`, and route E2E tests.
- `RbacService` core permission and role checks.
- `InMemoryRbacStorage` and reusable storage contract tests.

Known gaps this plan closes:

- `tenant.allowGlobalRolesInTenant` is declared but not evaluated.
- `RbacModuleOptions.auditLogger` is declared but not invoked.
- Prisma adapter, schema, migration, subpath export, and integration tests are absent.
- Testing utilities and integration helper subpaths are absent.
- README/docs/examples are incomplete for the full spec.

---

## File Map

Package/build:

- Modify: `package.json` to add subpath exports, scripts, optional peers, and dev dependencies.
- Modify: `package-lock.json` after dependency installation.
- Modify: `tsup.config.ts` to add multi-entry builds.
- Create: `vitest.integration.config.ts` for Prisma integration tests.
- Modify: `.github/workflows/ci.yml` to keep default verification fast and add a PostgreSQL-backed Prisma integration job.

Prisma adapter:

- Create: `src/prisma.ts` as the `@nestarc/rbac/prisma` barrel.
- Create: `src/adapters/prisma-rbac.storage.ts` for `PrismaRbacStorage`.
- Modify: `src/adapters/index.ts` only if root should expose the adapter type; do not root-export the adapter class unless the final package API decision requires it.
- Create: `prisma/schema.prisma.example`.
- Create: `prisma/migrations/0001_init_rbac.sql`.
- Create: `test/integration/prisma-rbac.storage.integration-spec.ts`.

Core carry-over:

- Modify: `src/rbac.service.ts` to support global role merging, RBAC write audit events, and service-level validation for write APIs.
- Modify: `src/rbac.guard.ts` to emit deny audit events and preserve safe HTTP responses.
- Modify: `src/interfaces/audit.ts` if event metadata needs stricter shape.
- Create: `src/audit/noop-rbac-audit.logger.ts`.
- Create: `src/audit/index.ts`.
- Modify: `src/index.ts` to root-export audit helpers that are dependency-free.

Testing utilities:

- Create: `src/testing.ts` as the `@nestarc/rbac/testing` barrel.
- Create: `src/testing/test-rbac.module.ts`.
- Create: `src/testing/expect-rbac-decision.ts`.
- Create: `src/testing/subjects.ts`.
- Create: `src/testing/index.ts`.
- Create: `test/unit/testing-helpers.spec.ts`.

Optional integrations:

- Create: `src/integrations/tenancy.ts`.
- Create: `src/integrations/api-keys.ts`.
- Create: `test/unit/integrations.spec.ts`.

Docs and examples:

- Modify: `README.md`.
- Create: `docs/installation.md`.
- Create: `docs/guards.md`.
- Create: `docs/prisma.md`.
- Create: `docs/testing.md`.
- Create: `docs/integrations.md`.
- Create: `examples/basic-http/README.md`.
- Create: `examples/basic-http/src/app.module.ts`.
- Create: `examples/basic-http/src/reports.controller.ts`.
- Create: `examples/api-keys/README.md`.
- Create: `examples/api-keys/src/app.module.ts`.
- Create: `examples/api-keys/src/api-key-auth.guard.ts`.
- Create: `examples/api-keys/src/reports.controller.ts`.
- Create: `examples/resource-scoped/README.md`.
- Create: `examples/resource-scoped/src/app.module.ts`.
- Create: `examples/resource-scoped/src/projects.controller.ts`.

---

## Task 1: Add Optional Peer Metadata And Prisma Tooling

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install Prisma dev dependencies**

Run:

```bash
npm install -D prisma @prisma/client
```

Expected: `package-lock.json` updates and install exits 0.

- [ ] **Step 2: Add optional peer ranges**

Add these packages to `peerDependencies`:

```json
"@prisma/client": ">=5 <7",
"prisma": ">=5 <7",
"@nestarc/tenancy": ">=0.1 <1",
"@nestarc/api-keys": ">=0.1 <1",
"@nestarc/audit-log": ">=0.1 <1"
```

Keep the existing NestJS, `reflect-metadata`, and `rxjs` peer dependencies.

- [ ] **Step 3: Add optional peer metadata**

Add:

```json
"peerDependenciesMeta": {
  "@prisma/client": { "optional": true },
  "prisma": { "optional": true },
  "@nestarc/tenancy": { "optional": true },
  "@nestarc/api-keys": { "optional": true },
  "@nestarc/audit-log": { "optional": true }
}
```

- [ ] **Step 4: Add Prisma scripts**

Add scripts:

```json
"prisma:generate": "prisma generate --schema=prisma/schema.prisma.example",
"prisma:migrate:test": "prisma db execute --schema=prisma/schema.prisma.example --file=prisma/migrations/0001_init_rbac.sql",
"test:prisma": "vitest run --config vitest.integration.config.ts"
```

These scripts will be used after Tasks 2 and 5 add the schema, migration, and integration config.

- [ ] **Step 5: Run metadata verification**

Run:

```bash
npm audit --omit=dev
npm run lint
```

Expected: production audit has no critical vulnerabilities, and lint still passes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add optional prisma and integration peer metadata"
```

Subpath exports are added in the tasks that create their source entry files:

- Task 3 adds `@nestarc/rbac/prisma`.
- Task 6 adds `@nestarc/rbac/testing`.
- Task 8 adds `@nestarc/rbac/integrations/tenancy` and `@nestarc/rbac/integrations/api-keys`.

---

## Subpath Export Snippets

Use these snippets in Tasks 3, 6, and 8 when each subpath's source file exists.

Update `tsup.config.ts` entries by keeping `index` and adding only available source entry files:

```ts
entry: {
  index: 'src/index.ts',
  prisma: 'src/prisma.ts',
  testing: 'src/testing.ts',
  'integrations/tenancy': 'src/integrations/tenancy.ts',
  'integrations/api-keys': 'src/integrations/api-keys.ts',
},
```

Keep optional packages external:

```ts
external: [
  '@nestjs/common',
  '@nestjs/core',
  'reflect-metadata',
  'rxjs',
  '@prisma/client',
  'prisma',
  '@nestarc/tenancy',
  '@nestarc/api-keys',
  '@nestarc/audit-log',
],
```

Add these `package.json` exports as each entry becomes available:

Prisma:

```json
"./prisma": {
  "import": {
    "types": "./dist/prisma.d.ts",
    "default": "./dist/prisma.js"
  },
  "require": {
    "types": "./dist/prisma.d.cts",
    "default": "./dist/prisma.cjs"
  }
}
```

Testing:

```json
"./testing": {
  "import": {
    "types": "./dist/testing.d.ts",
    "default": "./dist/testing.js"
  },
  "require": {
    "types": "./dist/testing.d.cts",
    "default": "./dist/testing.cjs"
  }
}
```

Tenancy integration:

```json
"./integrations/tenancy": {
  "import": {
    "types": "./dist/integrations/tenancy.d.ts",
    "default": "./dist/integrations/tenancy.js"
  },
  "require": {
    "types": "./dist/integrations/tenancy.d.cts",
    "default": "./dist/integrations/tenancy.cjs"
  }
}
```

API key integration:

```json
"./integrations/api-keys": {
  "import": {
    "types": "./dist/integrations/api-keys.d.ts",
    "default": "./dist/integrations/api-keys.js"
  },
  "require": {
    "types": "./dist/integrations/api-keys.d.cts",
    "default": "./dist/integrations/api-keys.cjs"
  }
}
```

---

## Task 2: Add Prisma Schema And PostgreSQL Migration

**Files:**

- Create: `prisma/schema.prisma.example`
- Create: `prisma/migrations/0001_init_rbac.sql`
- Test: `docs/prisma.md` will reference these files in Task 8.

- [ ] **Step 1: Create Prisma schema example**

Create `prisma/schema.prisma.example`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model RbacRole {
  id          String               @id @default(cuid())
  key         String
  name        String?
  description String?
  tenantId    String?              @map("tenant_id")
  isSystem    Boolean              @default(false) @map("is_system")
  createdAt   DateTime             @default(now()) @map("created_at")
  updatedAt   DateTime             @updatedAt @map("updated_at")
  permissions RbacRolePermission[]
  bindings    RbacRoleBinding[]

  @@index([tenantId, key])
  @@map("rbac_roles")
}

model RbacPermission {
  id        String               @id @default(cuid())
  key       String               @unique
  createdAt DateTime             @default(now()) @map("created_at")
  roles     RbacRolePermission[]

  @@map("rbac_permissions")
}

model RbacRolePermission {
  roleId       String         @map("role_id")
  permissionId String         @map("permission_id")
  role         RbacRole       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   RbacPermission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@map("rbac_role_permissions")
}

model RbacRoleBinding {
  id           String    @id @default(cuid())
  tenantId     String?   @map("tenant_id")
  subjectType  String    @map("subject_type")
  subjectId    String    @map("subject_id")
  roleId       String    @map("role_id")
  resourceType String?   @map("resource_type")
  resourceId   String?   @map("resource_id")
  expiresAt    DateTime? @map("expires_at")
  revokedAt    DateTime? @map("revoked_at")
  metadata     Json?
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  role         RbacRole  @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@index([tenantId, subjectType, subjectId])
  @@index([roleId])
  @@map("rbac_role_bindings")
}
```

- [ ] **Step 2: Create SQL migration**

Create `prisma/migrations/0001_init_rbac.sql` with PostgreSQL DDL:

```sql
CREATE TABLE IF NOT EXISTS rbac_roles (
  id text PRIMARY KEY,
  key text NOT NULL,
  name text,
  description text,
  tenant_id text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rbac_permissions (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  role_id text NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES rbac_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS rbac_role_bindings (
  id text PRIMARY KEY,
  tenant_id text,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  role_id text NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  resource_type text,
  resource_id text,
  expires_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS rbac_role_permissions_permission_idx
  ON rbac_role_permissions (permission_id);
```

- [ ] **Step 3: Validate migration syntax through Prisma db execute**

Run this against a local PostgreSQL database:

```bash
DATABASE_URL=postgresql://rbac:rbac@127.0.0.1:5432/rbac_test npx prisma db execute --schema=prisma/schema.prisma.example --file=prisma/migrations/0001_init_rbac.sql
```

Expected:

```text
Script executed successfully.
```

- [ ] **Step 4: Generate Prisma client from the example schema**

Run:

```bash
DATABASE_URL=postgresql://rbac:rbac@127.0.0.1:5432/rbac_test npx prisma generate --schema=prisma/schema.prisma.example
```

Expected:

```text
Generated Prisma Client
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma.example prisma/migrations/0001_init_rbac.sql
git commit -m "feat: add rbac prisma schema and migration"
```

---

## Task 3: Implement Prisma Adapter Role And Permission Operations

**Files:**

- Create: `src/prisma.ts`
- Create: `src/adapters/prisma-rbac.storage.ts`
- Test: `test/integration/prisma-rbac.storage.integration-spec.ts`

- [ ] **Step 1: Add adapter type tests through the storage contract harness**

Create `test/integration/prisma-rbac.storage.integration-spec.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe } from 'vitest';
import { PrismaRbacStorage } from '../../src/prisma';
import { runRbacStorageContract } from '../contract/storage-contract';

const databaseUrl = process.env.RBAC_PRISMA_DATABASE_URL ?? process.env.DATABASE_URL;
const describePrisma = databaseUrl ? describe : describe.skip;

describePrisma('PrismaRbacStorage', () => {
  const prisma = new PrismaClient({
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
  });

  beforeEach(async () => {
    await prisma.rbacRoleBinding.deleteMany();
    await prisma.rbacRolePermission.deleteMany();
    await prisma.rbacPermission.deleteMany();
    await prisma.rbacRole.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  runRbacStorageContract({
    createStorage: () => new PrismaRbacStorage(prisma),
  });
});
```

- [ ] **Step 2: Run integration test and confirm failure**

Run:

```bash
RBAC_PRISMA_DATABASE_URL=postgresql://rbac:rbac@127.0.0.1:5432/rbac_test npm run test:prisma
```

Expected: fail because `PrismaRbacStorage` does not exist.

- [ ] **Step 3: Create the Prisma subpath source barrel**

Create `src/prisma.ts`:

```ts
export * from './adapters/prisma-rbac.storage';
```

- [ ] **Step 4: Define Prisma client-like interfaces**

Create `src/adapters/prisma-rbac.storage.ts` with these interfaces at the top:

```ts
import { randomUUID } from 'node:crypto';
import { normalizePermission, normalizePermissions } from '../utils';
import type {
  AssignRoleStorageInput,
  DeleteRoleInput,
  FindRoleInput,
  GrantPermissionInput,
  ListBindingsStorageInput,
  ListEffectivePermissionsInput,
  ListEffectiveRolesInput,
  ListRolePermissionsInput,
  ListRolesInput,
  RbacEffectivePermission,
  RbacEffectiveRole,
  RbacRole,
  RbacRoleBinding,
  RbacStorage,
  RevokePermissionInput,
  RevokeRoleStorageInput,
  UpsertRoleInput,
} from '../interfaces';

type PrismaJson = Record<string, unknown>;

interface PrismaRoleRecord {
  id: string;
  key: string;
  name: string | null;
  description: string | null;
  tenantId: string | null;
  isSystem: boolean;
  permissions?: Array<{ permission: { key: string } }>;
}

interface PrismaBindingRecord {
  id: string;
  tenantId: string | null;
  subjectType: string;
  subjectId: string;
  roleId: string;
  resourceType: string | null;
  resourceId: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  metadata: PrismaJson | null;
}

interface PrismaEffectiveBindingRecord extends PrismaBindingRecord {
  role: PrismaRoleRecord & {
    permissions?: Array<{ permission: { key: string } }>;
  };
}

type PrismaDelegate = {
  findFirst(args: Record<string, unknown>): Promise<unknown>;
  findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  create(args: Record<string, unknown>): Promise<unknown>;
  update(args: Record<string, unknown>): Promise<unknown>;
  upsert(args: Record<string, unknown>): Promise<unknown>;
  delete(args: Record<string, unknown>): Promise<unknown>;
  deleteMany(args?: Record<string, unknown>): Promise<unknown>;
};

export interface PrismaRbacClientLike {
  rbacRole: PrismaDelegate;
  rbacPermission: PrismaDelegate;
  rbacRolePermission: PrismaDelegate;
  rbacRoleBinding: PrismaDelegate;
  $transaction<T>(fn: (tx: PrismaRbacClientLike) => Promise<T>): Promise<T>;
}
```

- [ ] **Step 5: Add mapping helpers**

Add these helpers below the interfaces:

```ts
const normalizeTenantId = (tenantId: string | null | undefined): string | null => tenantId ?? null;

const newId = (prefix: string): string => `${prefix}_${randomUUID()}`;

const roleWhere = (tenantId: string | null, key: string) =>
  tenantId === null
    ? { tenantId: null, key }
    : { tenantId, key };

const toRole = (record: PrismaRoleRecord): RbacRole => ({
  id: record.id,
  key: record.key,
  tenantId: record.tenantId,
  permissions: record.permissions?.map((entry) => entry.permission.key).sort() ?? [],
  ...(record.name !== null ? { name: record.name } : {}),
  ...(record.description !== null ? { description: record.description } : {}),
  isSystem: record.isSystem,
});

const toBinding = (record: PrismaBindingRecord): RbacRoleBinding => ({
  id: record.id,
  tenantId: record.tenantId,
  subjectType: record.subjectType,
  subjectId: record.subjectId,
  roleId: record.roleId,
  resourceType: record.resourceType,
  resourceId: record.resourceId,
  expiresAt: record.expiresAt,
  revokedAt: record.revokedAt,
  ...(record.metadata !== null ? { metadata: record.metadata } : {}),
});
```

- [ ] **Step 6: Implement role and permission methods**

Add class methods:

```ts
export class PrismaRbacStorage implements RbacStorage {
  constructor(private readonly prisma: PrismaRbacClientLike) {}

  async findRole(input: FindRoleInput): Promise<RbacRole | null> {
    const role = (await this.prisma.rbacRole.findFirst({
      where: roleWhere(normalizeTenantId(input.tenantId), input.key),
      include: { permissions: { include: { permission: true } } },
    })) as PrismaRoleRecord | null;

    return role ? toRole(role) : null;
  }

  async listRoles(input: ListRolesInput): Promise<RbacRole[]> {
    const roles = (await this.prisma.rbacRole.findMany({
      where: input.tenantId === undefined ? undefined : { tenantId: normalizeTenantId(input.tenantId) },
      include: { permissions: { include: { permission: true } } },
      orderBy: [{ tenantId: 'asc' }, { key: 'asc' }],
    })) as PrismaRoleRecord[];

    return roles.map(toRole);
  }

  async upsertRole(input: UpsertRoleInput): Promise<RbacRole> {
    return this.prisma.$transaction(async (tx) => {
      const roleId = 'roleId' in input ? input.roleId : undefined;
      const tenantId = normalizeTenantId(input.tenantId);
      const existing = roleId
        ? ((await tx.rbacRole.findFirst({ where: { id: roleId } })) as PrismaRoleRecord | null)
        : ((await tx.rbacRole.findFirst({ where: roleWhere(tenantId, input.key) })) as PrismaRoleRecord | null);
      const id = existing?.id ?? roleId ?? newId('role');
      const key = input.key ?? existing?.key ?? id;

      const role = (await tx.rbacRole.upsert({
        where: { id },
        create: {
          id,
          key,
          tenantId,
          name: input.name,
          description: input.description,
          isSystem: input.isSystem ?? false,
        },
        update: {
          key,
          ...(input.tenantId !== undefined ? { tenantId } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isSystem !== undefined ? { isSystem: input.isSystem } : {}),
        },
      })) as PrismaRoleRecord;

      if (input.permissions !== undefined) {
        await this.replaceRolePermissions(tx, role.id, input.permissions);
      }

      const reloaded = (await tx.rbacRole.findFirst({
        where: { id: role.id },
        include: { permissions: { include: { permission: true } } },
      })) as PrismaRoleRecord;

      return toRole(reloaded);
    });
  }

  async deleteRole(input: DeleteRoleInput): Promise<void> {
    await this.prisma.rbacRole.delete({ where: { id: input.roleId } });
  }

  async grantPermission(input: GrantPermissionInput): Promise<void> {
    const permission = normalizePermission(input.permission);
    await this.prisma.$transaction(async (tx) => {
      const permissionRecord = (await tx.rbacPermission.upsert({
        where: { key: permission },
        create: { id: newId('permission'), key: permission },
        update: {},
      })) as { id: string; key: string };

      await tx.rbacRolePermission.upsert({
        where: { roleId_permissionId: { roleId: input.roleId, permissionId: permissionRecord.id } },
        create: { roleId: input.roleId, permissionId: permissionRecord.id },
        update: {},
      });
    });
  }

  async revokePermission(input: RevokePermissionInput): Promise<void> {
    const permission = normalizePermission(input.permission);
    const permissionRecord = (await this.prisma.rbacPermission.findFirst({
      where: { key: permission },
    })) as { id: string } | null;
    if (!permissionRecord) return;

    await this.prisma.rbacRolePermission.deleteMany({
      where: { roleId: input.roleId, permissionId: permissionRecord.id },
    });
  }

  async listRolePermissions(input: ListRolePermissionsInput): Promise<string[]> {
    const links = (await this.prisma.rbacRolePermission.findMany({
      where: { roleId: input.roleId },
      include: { permission: true },
      orderBy: { permission: { key: 'asc' } },
    })) as Array<{ permission: { key: string } }>;

    return links.map((link) => link.permission.key);
  }

  private async replaceRolePermissions(
    tx: PrismaRbacClientLike,
    roleId: string,
    permissions: string[],
  ): Promise<void> {
    await tx.rbacRolePermission.deleteMany({ where: { roleId } });
    for (const permission of normalizePermissions(permissions)) {
      const permissionRecord = (await tx.rbacPermission.upsert({
        where: { key: permission },
        create: { id: newId('permission'), key: permission },
        update: {},
      })) as { id: string };
      await tx.rbacRolePermission.create({
        data: { roleId, permissionId: permissionRecord.id },
      });
    }
  }
}
```

If generated Prisma names differ from `roleId_permissionId`, inspect the generated client and adjust the compound unique key name before Task 4 verification.

- [ ] **Step 7: Confirm the adapter is still partial**

Run:

```bash
npm test -- test/integration/prisma-rbac.storage.integration-spec.ts
```

Expected: fail because binding and effective role/permission methods are still absent in this partial adapter. Do not commit this partial adapter; continue directly to Task 4.

Task 4 completes the adapter and creates the Prisma subpath commit.

---

## Task 4: Implement Prisma Binding And Effective Permission Operations

**Files:**

- Modify: `package.json`
- Modify: `tsup.config.ts`
- Modify: `src/prisma.ts`
- Modify: `src/adapters/prisma-rbac.storage.ts`
- Test: `test/integration/prisma-rbac.storage.integration-spec.ts`

- [ ] **Step 1: Add binding methods**

Add these methods to `PrismaRbacStorage`:

```ts
async assignRole(input: AssignRoleStorageInput): Promise<RbacRoleBinding> {
  const tenantId = normalizeTenantId(input.tenantId);
  const resourceType = input.resource?.type ?? null;
  const resourceId = input.resource?.id ?? null;

  return this.prisma.$transaction(async (tx) => {
    const existing = (await tx.rbacRoleBinding.findFirst({
      where: {
        tenantId,
        subjectType: input.subject.type,
        subjectId: input.subject.id,
        roleId: input.roleId,
        resourceType,
        resourceId,
        revokedAt: null,
      },
    })) as PrismaBindingRecord | null;

    if (existing) return toBinding(existing);

    const binding = (await tx.rbacRoleBinding.create({
      data: {
        id: newId('binding'),
        tenantId,
        subjectType: input.subject.type,
        subjectId: input.subject.id,
        roleId: input.roleId,
        resourceType,
        resourceId,
        expiresAt: input.expiresAt ?? null,
        revokedAt: null,
        metadata: input.metadata,
      },
    })) as PrismaBindingRecord;

    return toBinding(binding);
  });
}

async revokeRole(input: RevokeRoleStorageInput): Promise<void> {
  const existing = (await this.prisma.rbacRoleBinding.findFirst({
    where: { id: input.bindingId },
  })) as PrismaBindingRecord | null;
  if (!existing || existing.revokedAt) return;

  await this.prisma.rbacRoleBinding.update({
    where: { id: input.bindingId },
    data: { revokedAt: input.revokedAt ?? new Date() },
  });
}

async listBindings(input: ListBindingsStorageInput): Promise<RbacRoleBinding[]> {
  const bindings = (await this.prisma.rbacRoleBinding.findMany({
    where: {
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      ...(input.tenantId !== undefined ? { tenantId: normalizeTenantId(input.tenantId) } : {}),
    },
    orderBy: { id: 'asc' },
  })) as PrismaBindingRecord[];

  return bindings.map(toBinding);
}
```

- [ ] **Step 2: Add effective role query**

Add:

```ts
async listEffectiveRoles(input: ListEffectiveRolesInput): Promise<RbacEffectiveRole[]> {
  const now = input.now ?? new Date();
  const bindings = (await this.prisma.rbacRoleBinding.findMany({
    where: this.effectiveBindingWhere(input, now),
    include: { role: true },
    orderBy: { id: 'asc' },
  })) as PrismaEffectiveBindingRecord[];

  return bindings.map((binding) => ({
    roleKey: binding.role.key,
    roleId: binding.roleId,
    bindingId: binding.id,
    tenantId: binding.tenantId,
    resourceType: binding.resourceType,
    resourceId: binding.resourceId,
    expiresAt: binding.expiresAt,
  }));
}
```

- [ ] **Step 3: Add effective permission query**

Add:

```ts
async listEffectivePermissions(input: ListEffectivePermissionsInput): Promise<RbacEffectivePermission[]> {
  const now = input.now ?? new Date();
  const bindings = (await this.prisma.rbacRoleBinding.findMany({
    where: this.effectiveBindingWhere(input, now),
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
    orderBy: { id: 'asc' },
  })) as PrismaEffectiveBindingRecord[];

  return bindings.flatMap((binding) =>
    (binding.role.permissions ?? []).map((link) => ({
      roleKey: binding.role.key,
      roleId: binding.roleId,
      bindingId: binding.id,
      tenantId: binding.tenantId,
      resourceType: binding.resourceType,
      resourceId: binding.resourceId,
      expiresAt: binding.expiresAt,
      permission: link.permission.key,
    })),
  );
}
```

- [ ] **Step 4: Add effective binding filter helper**

Add:

```ts
private effectiveBindingWhere(
  input: ListEffectiveRolesInput,
  now: Date,
): Record<string, unknown> {
  const resourceFilter = input.resource
    ? {
        OR: [
          { resourceType: null, resourceId: null },
          { resourceType: input.resource.type, resourceId: input.resource.id },
        ],
      }
    : { resourceType: null, resourceId: null };

  return {
    subjectType: input.subject.type,
    subjectId: input.subject.id,
    tenantId: normalizeTenantId(input.tenantId),
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    ...resourceFilter,
  };
}
```

- [ ] **Step 5: Run Prisma contract tests**

Before running the contract, add the `prisma` entry to `tsup.config.ts` and the `./prisma` export in `package.json` using the snippets above.

Run:

```bash
npm run build
RBAC_PRISMA_DATABASE_URL=postgresql://rbac:rbac@127.0.0.1:5432/rbac_test npm run test:prisma
```

Expected: build emits `dist/prisma.js`, `dist/prisma.cjs`, `dist/prisma.d.ts`, and all storage contract tests pass for `PrismaRbacStorage`.

- [ ] **Step 6: Commit**

```bash
git add package.json tsup.config.ts src/prisma.ts src/adapters/prisma-rbac.storage.ts test/integration/prisma-rbac.storage.integration-spec.ts
git commit -m "feat: complete prisma rbac storage contract"
```

---

## Task 5: Separate Prisma Integration Tests From Default Verification

**Files:**

- Modify: `package.json`
- Create: `vitest.integration.config.ts`
- Modify: `vitest.config.ts`
- Modify: `.github/workflows/ci.yml`
- Test: `test/integration/prisma-rbac.storage.integration-spec.ts`

- [ ] **Step 1: Exclude integration tests from default Vitest config**

Update `vitest.config.ts`:

```ts
exclude: ['node_modules', 'dist', 'test/integration/**'],
```

Keep the existing unit/e2e `include` entries.

- [ ] **Step 2: Create integration Vitest config**

Create `vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.integration-spec.ts'],
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 3: Confirm Prisma test scripts**

Confirm `package.json` has the scripts introduced in Task 1:

```json
"prisma:generate": "prisma generate --schema=prisma/schema.prisma.example",
"prisma:migrate:test": "prisma db execute --schema=prisma/schema.prisma.example --file=prisma/migrations/0001_init_rbac.sql",
"test:prisma": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 4: Add CI Prisma integration job**

Add a separate job in `.github/workflows/ci.yml`:

```yaml
  prisma-integration:
    name: Prisma Integration
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: rbac
          POSTGRES_PASSWORD: rbac
          POSTGRES_DB: rbac_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://rbac:rbac@127.0.0.1:5432/rbac_test
      RBAC_PRISMA_DATABASE_URL: postgresql://rbac:rbac@127.0.0.1:5432/rbac_test
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Generate Prisma client
        run: npm run prisma:generate
      - name: Apply RBAC migration
        run: npm run prisma:migrate:test
      - name: Run Prisma contract tests
        run: npm run test:prisma
```

- [ ] **Step 5: Verify default tests do not require PostgreSQL**

Run:

```bash
npm test
npm run test:e2e
npm run build
```

Expected: all pass without `DATABASE_URL`.

- [ ] **Step 6: Verify Prisma integration tests with PostgreSQL**

Run:

```bash
npm run prisma:generate
npm run prisma:migrate:test
npm run test:prisma
```

Expected: Prisma client generation succeeds, migration executes, and contract tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.integration.config.ts .github/workflows/ci.yml test/integration/prisma-rbac.storage.integration-spec.ts
git commit -m "test: add postgres-backed prisma storage contract"
```

---

## Task 6: Implement Testing Utilities Subpath

**Files:**

- Create: `src/testing/index.ts`
- Create: `src/testing/test-rbac.module.ts`
- Create: `src/testing/expect-rbac-decision.ts`
- Create: `src/testing/subjects.ts`
- Modify: `src/testing.ts`
- Modify: `package.json`
- Modify: `tsup.config.ts`
- Test: `test/unit/testing-helpers.spec.ts`

- [ ] **Step 1: Write failing tests for testing helpers**

Create `test/unit/testing-helpers.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RbacService } from '../../src';
import {
  TestRbacModule,
  expectAllowed,
  expectDenied,
  rbacApiKey,
  rbacServiceAccount,
  rbacUser,
} from '../../src/testing';

describe('testing helpers', () => {
  it('creates typed subject fixtures', () => {
    expect(rbacUser('user_1', 'tenant_1')).toEqual({
      type: 'user',
      id: 'user_1',
      tenantId: 'tenant_1',
    });
    expect(rbacApiKey('key_1')).toEqual({ type: 'api_key', id: 'key_1' });
    expect(rbacServiceAccount('svc_1')).toEqual({ type: 'service_account', id: 'svc_1' });
  });

  it('registers an in-memory RBAC module for tests', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TestRbacModule.forRoot({
          tenant: { requiredByDefault: true },
          subject: rbacUser('user_1', 'tenant_1'),
        }),
      ],
    }).compile();

    expect(moduleRef.get(RbacService)).toBeInstanceOf(RbacService);
  });

  it('asserts allowed and denied decisions without depending on vitest globals', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestRbacModule.forRoot()],
    }).compile();
    const rbac = moduleRef.get(RbacService);
    const role = await rbac.createRole({
      tenantId: 'tenant_1',
      key: 'viewer',
      permissions: ['reports.read'],
    });
    await rbac.assignRole({
      tenantId: 'tenant_1',
      subject: rbacUser('user_1', 'tenant_1'),
      roleId: role.id,
    });

    await expectAllowed(rbac, {
      subject: rbacUser('user_1', 'tenant_1'),
      tenantId: 'tenant_1',
      permission: 'reports.read',
    });
    await expectDenied(rbac, {
      subject: rbacUser('user_1', 'tenant_1'),
      tenantId: 'tenant_1',
      permission: 'reports.write',
    });
  });
});
```

- [ ] **Step 2: Implement subject fixtures**

Create `src/testing/subjects.ts`:

```ts
import type { RbacSubject } from '../interfaces';

export const rbacUser = (id: string, tenantId?: string | null): RbacSubject => ({
  type: 'user',
  id,
  ...(tenantId !== undefined ? { tenantId } : {}),
});

export const rbacApiKey = (id: string, tenantId?: string | null): RbacSubject => ({
  type: 'api_key',
  id,
  ...(tenantId !== undefined ? { tenantId } : {}),
});

export const rbacServiceAccount = (id: string, tenantId?: string | null): RbacSubject => ({
  type: 'service_account',
  id,
  ...(tenantId !== undefined ? { tenantId } : {}),
});
```

- [ ] **Step 3: Implement expectation helpers**

Create `src/testing/expect-rbac-decision.ts`:

```ts
import type { RbacCanInput, RbacDecision } from '../interfaces';
import type { RbacService } from '../rbac.service';

export async function expectAllowed(
  rbac: RbacService,
  input: RbacCanInput,
): Promise<RbacDecision> {
  const decision = await rbac.can(input);
  if (!decision.allowed) {
    throw new Error(`Expected RBAC decision to allow, received ${decision.reason}`);
  }
  return decision;
}

export async function expectDenied(
  rbac: RbacService,
  input: RbacCanInput,
  reason?: RbacDecision['reason'],
): Promise<RbacDecision> {
  const decision = await rbac.can(input);
  if (decision.allowed) {
    throw new Error('Expected RBAC decision to deny, received allowed decision');
  }
  if (reason !== undefined && decision.reason !== reason) {
    throw new Error(`Expected RBAC denial reason ${reason}, received ${decision.reason}`);
  }
  return decision;
}
```

- [ ] **Step 4: Implement `TestRbacModule`**

Create `src/testing/test-rbac.module.ts`:

```ts
import { DynamicModule, Module } from '@nestjs/common';
import { InMemoryRbacStorage } from '../adapters';
import { RbacModule } from '../rbac.module';
import type { RbacModuleOptions, RbacStorage, RbacSubject } from '../interfaces';

export interface TestRbacModuleOptions
  extends Omit<RbacModuleOptions, 'storage' | 'subjectResolver'> {
  storage?: RbacStorage | undefined;
  subject?: RbacSubject | undefined;
  subjectResolver?: RbacModuleOptions['subjectResolver'] | undefined;
}

@Module({})
export class TestRbacModule {
  static forRoot(options: TestRbacModuleOptions = {}): DynamicModule {
    const { storage, subject, subjectResolver, ...rbacOptions } = options;

    return RbacModule.forRoot({
      storage: storage ?? new InMemoryRbacStorage(),
      subjectResolver: subjectResolver ?? (subject ? () => subject : undefined),
      ...rbacOptions,
    });
  }
}
```

- [ ] **Step 5: Add barrels**

Create `src/testing/index.ts`:

```ts
export * from './expect-rbac-decision';
export * from './subjects';
export * from './test-rbac.module';
```

Keep `src/testing.ts`:

```ts
export * from './testing';
```

- [ ] **Step 6: Add testing subpath packaging**

Add `testing: 'src/testing.ts'` to `tsup.config.ts` entry and add the `./testing` export in `package.json` using the Subpath Export Snippets section.

- [ ] **Step 7: Verify**

Run:

```bash
npm test -- test/unit/testing-helpers.spec.ts
npm run build
```

Expected: tests pass and `dist/testing.*` files are generated.

- [ ] **Step 8: Commit**

```bash
git add package.json tsup.config.ts src/testing.ts src/testing test/unit/testing-helpers.spec.ts
git commit -m "feat: add public rbac testing utilities"
```

---

## Task 7: Implement Audit Logging And Global Role Evaluation

**Files:**

- Modify: `src/interfaces/audit.ts`
- Create: `src/audit/noop-rbac-audit.logger.ts`
- Create: `src/audit/index.ts`
- Modify: `src/index.ts`
- Modify: `src/rbac.service.ts`
- Modify: `src/rbac.guard.ts`
- Test: `test/unit/rbac-service.spec.ts`
- Test: `test/unit/rbac-module.spec.ts`

- [ ] **Step 1: Write failing service tests**

Add tests to `test/unit/rbac-service.spec.ts`:

```ts
it('allows global roles inside tenants only when configured', async () => {
  const globalStorage = new InMemoryRbacStorage();
  const globalRole = await globalStorage.upsertRole({
    tenantId: null,
    key: 'global_admin',
    permissions: ['system.read'],
  });
  await globalStorage.assignRole({
    tenantId: null,
    subject: user('user_global', 'tenant_1'),
    roleId: globalRole.id,
  });

  const denyService = new RbacService({ storage: globalStorage });
  await expect(
    denyService.can({
      subject: user('user_global', 'tenant_1'),
      tenantId: 'tenant_1',
      permission: 'system.read',
    }),
  ).resolves.toMatchObject({ allowed: false });

  const allowService = new RbacService({
    storage: globalStorage,
    tenant: { allowGlobalRolesInTenant: true },
  });
  await expect(
    allowService.can({
      subject: user('user_global', 'tenant_1'),
      tenantId: 'tenant_1',
      permission: 'system.read',
    }),
  ).resolves.toMatchObject({
    allowed: true,
    matchedRoleKeys: ['global_admin'],
  });
});

it('logs write operation audit events without subject attributes', async () => {
  const log = vi.fn();
  const auditService = new RbacService({
    storage: new InMemoryRbacStorage(),
    auditLogger: { log },
  });
  const role = await auditService.createRole({
    tenantId: 'tenant_1',
    key: 'auditor',
    permissions: [],
  });
  await auditService.assignRole({
    tenantId: 'tenant_1',
    subject: {
      type: 'user',
      id: 'user_audit',
      attributes: { email: 'private@example.com' },
    },
    roleId: role.id,
  });

  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'rbac.role.created',
      tenantId: 'tenant_1',
      metadata: expect.objectContaining({ roleId: role.id, roleKey: 'auditor' }),
    }),
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.com');
});
```

- [ ] **Step 2: Write failing guard audit test**

Add to `test/unit/rbac-module.spec.ts`:

```ts
it('logs denied permission decisions through the configured audit logger', async () => {
  const log = vi.fn();
  const can = vi.fn(() =>
    Promise.resolve({
      allowed: false,
      reason: 'denied_no_matching_permission' as const,
      subject,
      tenantId: 'tenant_1',
      permission: 'reports.read',
    }),
  );

  class ReportsController {
    @Can('reports.read')
    read() {
      return undefined;
    }
  }

  const handler = getHandler(ReportsController.prototype, 'read');
  const moduleRef = await Test.createTestingModule({
    providers: [
      Reflector,
      RbacGuard,
      { provide: RbacService, useValue: { can } },
      {
        provide: RBAC_OPTIONS,
        useValue: {
          storage: new InMemoryRbacStorage(),
          subjectResolver: () => subject,
          auditLogger: { log },
        } satisfies RbacModuleOptions,
      },
    ],
  }).compile();

  await expect(
    moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
  ).rejects.toMatchObject({ response: { code: 'RBAC_PERMISSION_DENIED' } });

  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'rbac.permission.denied',
      tenantId: 'tenant_1',
      subjectType: 'user',
      subjectId: 'user_1',
    }),
  );
});
```

- [ ] **Step 3: Add no-op audit logger**

Create `src/audit/noop-rbac-audit.logger.ts`:

```ts
import type { RbacAuditEvent, RbacAuditLogger } from '../interfaces';

export class NoopRbacAuditLogger implements RbacAuditLogger {
  log(event: RbacAuditEvent): void {
    void event;
  }
}
```

Create `src/audit/index.ts`:

```ts
export * from './noop-rbac-audit.logger';
```

Add to `src/index.ts`:

```ts
export * from './audit';
```

- [ ] **Step 4: Add audit helper methods to `RbacService`**

Add private method:

```ts
private async logAudit(event: RbacAuditEvent): Promise<void> {
  await this.options.auditLogger?.log(event);
}
```

Wrap write methods. Example for `createRole`:

```ts
async createRole(input: CreateRoleInput): Promise<RbacRole> {
  const role = await this.options.storage.upsertRole(input);
  await this.logAudit({
    type: 'rbac.role.created',
    tenantId: role.tenantId,
    metadata: { roleId: role.id, roleKey: role.key },
  });
  return role;
}
```

Apply the same pattern:

- `updateRole()` logs `rbac.role.updated`.
- `deleteRole()` logs `rbac.role.deleted`.
- `grantPermission()` logs `rbac.permission.granted`.
- `revokePermission()` logs `rbac.permission.revoked`.
- `assignRole()` logs `rbac.role.assigned` with `subjectType` and `subjectId`.
- `revokeRole()` logs `rbac.role.revoked`.

Do not log `subject.attributes`, binding `metadata`, or full permission inventory.

- [ ] **Step 5: Add global role merging**

In `canRole()` and `canPermission()`, load tenant-scoped records and, when `tenantId !== null` and `this.options.tenant?.allowGlobalRolesInTenant === true`, also load global records with `tenantId: null`. Merge the arrays before resource filtering:

```ts
private async listEffectivePermissionsForTenant(input: RbacCanInput, subject: RbacSubject, tenantId: string | null) {
  const now = this.resolveNow(input);
  const tenantPermissions = await this.options.storage.listEffectivePermissions({
    subject,
    tenantId,
    resource: input.resource,
    now,
  });

  if (tenantId === null || this.options.tenant?.allowGlobalRolesInTenant !== true) {
    return tenantPermissions;
  }

  const globalPermissions = await this.options.storage.listEffectivePermissions({
    subject,
    tenantId: null,
    resource: input.resource,
    now,
  });

  return [...tenantPermissions, ...globalPermissions];
}
```

Create a matching `listEffectiveRolesForTenant()` helper.

- [ ] **Step 6: Add guard deny audit logging**

In `RbacGuard.canActivate()`, before throwing for a denied decision, log:

```ts
await this.options.auditLogger?.log({
  type: 'rbac.permission.denied',
  tenantId: decision.tenantId,
  subjectType: decision.subject?.type,
  subjectId: decision.subject?.id,
  metadata: {
    reason: decision.reason,
    permission: decision.permission,
    permissions: decision.permissions,
    roleKey: decision.roleKey,
    resource: decision.resource,
  },
});
```

Keep the HTTP response body unchanged and safe.

- [ ] **Step 7: Verify**

Run:

```bash
npm test -- test/unit/rbac-service.spec.ts test/unit/rbac-module.spec.ts
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/interfaces/audit.ts src/audit src/index.ts src/rbac.service.ts src/rbac.guard.ts test/unit/rbac-service.spec.ts test/unit/rbac-module.spec.ts
git commit -m "feat: add rbac audit events and global tenant roles"
```

---

## Task 8: Implement Optional Integration Helpers

**Files:**

- Create: `src/integrations/tenancy.ts`
- Create: `src/integrations/api-keys.ts`
- Modify: `package.json`
- Modify: `tsup.config.ts`
- Test: `test/unit/integrations.spec.ts`

- [ ] **Step 1: Write integration helper tests**

Create `test/unit/integrations.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApiKeySubjectResolver } from '../../src/integrations/api-keys';
import { createTenancyTenantResolver } from '../../src/integrations/tenancy';
import type { ExecutionContext } from '@nestjs/common';

const contextWithRequest = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as Pick<ExecutionContext, 'switchToHttp'> as ExecutionContext;

describe('integration helpers', () => {
  it('resolves tenant ids from a dependency-free tenancy getter', () => {
    const resolver = createTenancyTenantResolver(() => 'tenant_1');
    expect(resolver(contextWithRequest({}), {}, { type: 'user', id: 'user_1' })).toBe('tenant_1');
  });

  it('maps Nestarc API key context into an RBAC subject', () => {
    const resolver = createApiKeySubjectResolver();
    expect(
      resolver(
        contextWithRequest({
          apiKeyContext: {
            keyId: 'key_1',
            tenantId: 'tenant_1',
            ownerId: 'user_1',
          },
        }),
      ),
    ).toEqual({
      type: 'api_key',
      id: 'key_1',
      tenantId: 'tenant_1',
      attributes: {
        keyId: 'key_1',
        tenantId: 'tenant_1',
        ownerId: 'user_1',
      },
    });
  });
});
```

- [ ] **Step 2: Implement tenancy resolver helper**

Create `src/integrations/tenancy.ts`:

```ts
import type { RbacTenantResolver } from '../interfaces';

export type RbacTenantIdGetter = () => string | null | undefined;

export function createTenancyTenantResolver(getTenantId: RbacTenantIdGetter): RbacTenantResolver {
  return () => getTenantId();
}
```

- [ ] **Step 3: Implement API key subject resolver helper**

Create `src/integrations/api-keys.ts`:

```ts
import type { ExecutionContext } from '@nestjs/common';
import type { RbacSubject, RbacSubjectResolver } from '../interfaces';

type ApiKeyContextLike = {
  keyId?: unknown;
  id?: unknown;
  tenantId?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};

export function createApiKeySubjectResolver(): RbacSubjectResolver {
  return (context: ExecutionContext): RbacSubject | undefined => {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const candidate = request.apiKeyContext ?? request.apiKey;
    if (!isRecord(candidate)) return undefined;

    const apiKey = candidate as ApiKeyContextLike;
    const id = toNonEmptyString(apiKey.keyId) ?? toNonEmptyString(apiKey.id);
    if (!id) return undefined;

    const tenantId = toNonEmptyString(apiKey.tenantId);
    return {
      type: 'api_key',
      id,
      ...(tenantId !== undefined ? { tenantId } : {}),
      attributes: candidate,
    };
  };
}
```

- [ ] **Step 4: Add integration subpath packaging**

Add these entries to `tsup.config.ts`:

```ts
'integrations/tenancy': 'src/integrations/tenancy.ts',
'integrations/api-keys': 'src/integrations/api-keys.ts',
```

Add `./integrations/tenancy` and `./integrations/api-keys` exports in `package.json` using the Subpath Export Snippets section.

- [ ] **Step 5: Verify optional dependency isolation**

Run:

```bash
rg -n "from '@nestarc/tenancy'|from '@nestarc/api-keys'|require\\('@nestarc" src package.json
npm test -- test/unit/integrations.spec.ts
npm run build
```

Expected: `rg` finds no hard imports from optional packages, tests pass, and build passes.

- [ ] **Step 6: Commit**

```bash
git add package.json tsup.config.ts src/integrations/tenancy.ts src/integrations/api-keys.ts test/unit/integrations.spec.ts
git commit -m "feat: add optional rbac integration helpers"
```

---

## Task 9: Expand README, Docs, And Examples

**Files:**

- Modify: `README.md`
- Create: `docs/installation.md`
- Create: `docs/guards.md`
- Create: `docs/prisma.md`
- Create: `docs/testing.md`
- Create: `docs/integrations.md`
- Create: `examples/basic-http/README.md`
- Create: `examples/basic-http/src/app.module.ts`
- Create: `examples/basic-http/src/reports.controller.ts`
- Create: `examples/api-keys/README.md`
- Create: `examples/api-keys/src/app.module.ts`
- Create: `examples/api-keys/src/api-key-auth.guard.ts`
- Create: `examples/api-keys/src/reports.controller.ts`
- Create: `examples/resource-scoped/README.md`
- Create: `examples/resource-scoped/src/app.module.ts`
- Create: `examples/resource-scoped/src/projects.controller.ts`

- [ ] **Step 1: Expand README sections**

Update `README.md` to include these top-level headings:

```md
## Why @nestarc/rbac
## Installation
## Quickstart
## Protecting Routes
## Tenant-Aware Checks
## Resource-Scoped Roles
## Prisma Setup
## API Key Recipe
## Testing Utilities
## Security Notes
```

Use `InMemoryRbacStorage` for quickstart and `PrismaRbacStorage` only in the Prisma section.

- [ ] **Step 2: Create installation docs**

Create `docs/installation.md` with install commands:

```md
# Installation

Install the package and required NestJS peer dependencies:

```bash
npm install @nestarc/rbac @nestjs/common @nestjs/core reflect-metadata rxjs
```

For PostgreSQL persistence, also install Prisma in the consuming app:

```bash
npm install @prisma/client
npm install -D prisma
```
```

- [ ] **Step 3: Create guards docs**

Create `docs/guards.md` covering `@Can()`, `@RequirePermissions()`, `@RequireRole()`, `@SkipRbac()`, `@CurrentRbacSubject()`, APP_GUARD registration, tenant modes, and resource declarations. Include a controller example that compiles:

```ts
@Controller('projects')
export class ProjectsController {
  @Can('project.member.invite', {
    tenant: 'required',
    resource: { type: 'project', idParam: 'projectId' },
  })
  @Post(':projectId/invitations')
  invite(@CurrentRbacSubject() subject: RbacSubject) {
    return { invitedBy: subject.id };
  }
}
```

- [ ] **Step 4: Create Prisma docs**

Create `docs/prisma.md` documenting:

- Copy `prisma/schema.prisma.example` models into the app schema.
- Apply `prisma/migrations/0001_init_rbac.sql` or translate it into the app migration flow.
- Register:

```ts
RbacModule.forRootAsync({
  imports: [PrismaModule],
  inject: [PrismaService],
  useFactory: (prisma: PrismaService) => ({
    storage: new PrismaRbacStorage(prisma),
  }),
});
```

- Run contract tests with `npm run test:prisma`.

- [ ] **Step 5: Create testing docs**

Create `docs/testing.md` with:

```ts
const moduleRef = await Test.createTestingModule({
  imports: [
    TestRbacModule.forRoot({
      tenant: { requiredByDefault: true },
      subject: rbacUser('user_1', 'tenant_1'),
    }),
  ],
}).compile();

const rbac = moduleRef.get(RbacService);
await expectAllowed(rbac, {
  subject: rbacUser('user_1', 'tenant_1'),
  tenantId: 'tenant_1',
  permission: 'reports.read',
});
```

- [ ] **Step 6: Create integrations docs**

Create `docs/integrations.md` documenting:

- Tenancy helper uses a callback and does not import `@nestarc/tenancy`.
- API key helper reads `request.apiKeyContext` or `request.apiKey`.
- Audit logger accepts a structural `{ log(event) }` implementation.

- [ ] **Step 7: Create examples**

Each example should be a README plus source snippets. Keep them copy-pasteable rather than full standalone apps.

`examples/basic-http/src/app.module.ts`:

```ts
@Module({
  imports: [
    RbacModule.forRoot({
      storage: new InMemoryRbacStorage(),
      tenant: { requiredByDefault: true },
    }),
  ],
  controllers: [ReportsController],
})
export class AppModule {}
```

`examples/api-keys/src/app.module.ts`:

```ts
@Module({
  imports: [
    RbacModule.forRoot({
      storage: new InMemoryRbacStorage(),
      subjectResolver: createApiKeySubjectResolver(),
      tenant: { requiredByDefault: true },
    }),
  ],
  controllers: [ReportsController],
  providers: [ApiKeyAuthGuard],
})
export class AppModule {}
```

`examples/resource-scoped/src/projects.controller.ts`:

```ts
@Controller('projects')
export class ProjectsController {
  @Can('project.member.invite', {
    resource: { type: 'project', idParam: 'projectId' },
    tenant: 'required',
  })
  @Post(':projectId/invitations')
  invite() {
    return { ok: true };
  }
}
```

- [ ] **Step 8: Verify docs links and examples**

Run:

```bash
rg -n "PrismaRbacStorage|TestRbacModule|createApiKeySubjectResolver|createTenancyTenantResolver|expectAllowed" README.md docs examples
rg -n "T[B]D|T[O]DO|f[i]ll in|coming s[o]on" README.md docs examples
```

Expected: first command finds all major APIs; second command returns no matches.

- [ ] **Step 9: Commit**

```bash
git add README.md docs/installation.md docs/guards.md docs/prisma.md docs/testing.md docs/integrations.md examples
git commit -m "docs: add rbac prisma testing and integration guides"
```

---

## Task 10: Final Verification And Release Readiness Check

**Files:**

- Modify only files required to fix verification failures.

- [ ] **Step 1: Run full default verification**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run test:coverage
```

Expected:

- lint exits 0.
- typecheck exits 0.
- default test suite passes without PostgreSQL.
- e2e test suite passes.
- build emits `dist/index.*`, `dist/prisma.*`, `dist/testing.*`, and integration subpath outputs.
- coverage remains at or above statements 90%, branches 85%, functions 90%, lines 90%.

- [ ] **Step 2: Run Prisma verification**

With PostgreSQL available:

```bash
npm run prisma:generate
npm run prisma:migrate:test
npm run test:prisma
```

Expected: Prisma integration storage contract passes.

- [ ] **Step 3: Inspect package contents**

Run:

```bash
npm pack --dry-run
```

Expected package contents include:

- `dist/index.d.ts`
- `dist/prisma.d.ts`
- `dist/testing.d.ts`
- `dist/integrations/tenancy.d.ts`
- `dist/integrations/api-keys.d.ts`
- `README.md`
- `LICENSE`

- [ ] **Step 4: Check spec coverage**

Run:

```bash
rg -n "PrismaRbacStorage|schema.prisma.example|0001_init_rbac.sql|TestRbacModule|expectAllowed|expectDenied|createTenancyTenantResolver|createApiKeySubjectResolver|NoopRbacAuditLogger" src test docs README.md package.json prisma examples
```

Expected: every major Milestone 3-5 deliverable appears in implementation, tests, and docs.

- [ ] **Step 5: Commit final verification fixes**

If verification required edits:

```bash
git add .
git commit -m "chore: verify rbac milestones 3 through 5"
```

If no edits were required, do not create an empty commit.

---

## Self-Review Checklist

- [ ] Prisma adapter implements every `RbacStorage` method and passes the shared contract.
- [ ] Prisma tests are not part of default `npm test`.
- [ ] `@prisma/client`, `prisma`, `@nestarc/tenancy`, `@nestarc/api-keys`, and `@nestarc/audit-log` are optional peers.
- [ ] Subpath exports build declarations for ESM and CJS consumers.
- [ ] Testing helpers do not import Vitest or Jest.
- [ ] Integration helpers do not hard-import optional packages.
- [ ] Audit events omit `subject.attributes`, binding metadata, and full permission inventories.
- [ ] README includes the ten required sections from `docs/spec.md`.
- [ ] Docs pages and examples exist for installation, guards, Prisma, testing, and integrations.
- [ ] `tenant.allowGlobalRolesInTenant` is tested for deny-by-default and allow-when-enabled behavior.

---

## Execution Handoff

Plan complete when this file is saved. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, and keep Prisma/docs/testing work independent.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, with checkpoints after each task.

Recommended sequence:

1. Tasks 1-2 establish packaging and Prisma assets.
2. Tasks 3-5 implement and verify Prisma storage.
3. Tasks 6-8 add testing utilities, audit, and optional integrations.
4. Tasks 9-10 complete docs/examples and release readiness.
