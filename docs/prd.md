# PRD: `@nestarc/rbac`

**문서 버전:** 1.0  
**작성일:** 2026-06-02  
**대상 패키지:** `@nestarc/rbac`  
**예상 저장소명:** `nestjs-rbac`  
**주요 사용자:** NestJS 기반 멀티테넌트 SaaS 백엔드 개발자  
**구현 도구:** Codex, TypeScript, NestJS, Prisma, PostgreSQL

---

## 0. Codex 시작 지시문

이 PRD를 Codex에 전달할 때는 아래 목표로 시작한다.

> `@nestarc/rbac` 패키지의 MVP를 구현한다. 우선 NestJS HTTP route에서 `@Can()` / `@RequirePermission()` 메타데이터를 읽어 `RbacGuard`가 subject, tenant, role binding, role permission을 평가하도록 만든다. In-memory storage adapter, Prisma storage adapter, typed errors, 테스트 유틸, contract test suite, README 예제를 포함한다. 인증 기능은 만들지 말고, `request.user` 또는 커스텀 `subjectResolver`에서 subject를 가져온다. tenant는 route 옵션에 따라 fail-closed로 처리한다.

Codex는 구현 전에 현재 repository의 package manager, build tool, test runner, lint 설정을 확인하고 기존 nestarc 패키지 스타일과 맞춘다. 기존 설정이 없으면 `tsup` 또는 `tsc`, `vitest`, `eslint`, `prettier` 기반의 최소 구성을 만든다.

---

## 1. 배경과 문제 정의

NestJS 공식 문서는 authorization이 authentication과 독립적인 단계이며, RBAC는 guard와 route metadata를 이용해 구현할 수 있다고 설명한다. 공식 예제는 `@Roles()` 데코레이터와 `RolesGuard`로 시작하지만, 실제 SaaS에서는 다음 문제가 남는다.

1. tenant별 role/permission 저장소가 없다.
2. user, api key, service account 같은 여러 subject를 동일한 모델로 다루기 어렵다.
3. resource-scoped role, 예를 들어 특정 project의 maintainer 권한을 표현하기 어렵다.
4. 권한 거부 사유, audit log, 테스트 헬퍼, storage adapter contract가 없다.
5. `@nestarc/tenancy`, `@nestarc/api-keys`, `@nestarc/audit-log`와 이어지는 공식 패키지가 없다.

nestarc Community 로드맵은 core 방향을 production SaaS backend primitives로 두고, Next 항목에 `@nestarc/rbac`를 포함한다. 따라서 이 패키지는 단순한 `@Roles()` wrapper가 아니라 **tenant-aware SaaS authorization primitive**가 되어야 한다.

---

## 2. 제품 목표

### 2.1 핵심 목표

`@nestarc/rbac`는 NestJS 앱에서 다음을 가능하게 해야 한다.

- route handler, controller, service 코드에서 permission 중심의 authorization을 선언한다.
- tenant-scoped role binding을 기본 모델로 제공한다.
- user, API key, service account를 같은 subject abstraction으로 평가한다.
- global role과 tenant role을 모두 지원한다.
- resource-scoped role binding을 지원한다.
- authorization 실패 시 기본적으로 fail-closed로 동작한다.
- Prisma/PostgreSQL과 in-memory storage를 제공한다.
- 테스트에서 권한 허용/거부를 쉽게 검증할 수 있다.
- `@nestarc/tenancy`, `@nestarc/api-keys`, `@nestarc/audit-log`와 선택적으로 통합할 수 있다.

### 2.2 비목표

MVP에서는 아래 기능을 만들지 않는다.

- 로그인, JWT 발급, password, session 같은 authentication 기능
- 관리자 UI
- billing, plan, quota, entitlement 기능
- OPA/Rego, Casbin model DSL, CASL ability DSL의 완전 대체
- 복잡한 ABAC condition expression engine
- frontend SDK
- GraphQL 전용 decorator와 schema directive
- distributed cache invalidation
- organization hierarchy, nested team inheritance
- row-level query filtering 자동 생성

향후 확장 가능성은 열어두되, MVP는 안정적인 RBAC core에 집중한다.

---

## 3. 사용자 페르소나와 사용 시나리오

### 3.1 SaaS API 개발자

개발자는 API route에 다음처럼 권한을 선언하고 싶다.

```ts
@UseGuards(AuthGuard, RbacGuard)
@Can('invoice.read')
@Get(':invoiceId')
findInvoice(@Param('invoiceId') invoiceId: string) {
  return this.invoices.findOne(invoiceId);
}
```

개발자는 business logic마다 수동으로 `if (!user.roles.includes(...))`를 반복하지 않아야 한다.

### 3.2 멀티테넌트 플랫폼 운영자

운영자는 tenant마다 owner, admin, member, viewer 같은 role을 다르게 부여하고 싶다.

```ts
await rbac.assignRole({
  tenantId: 'tenant_123',
  subject: { type: 'user', id: 'user_123' },
  roleKey: 'owner',
});
```

### 3.3 API key 기반 public API 개발자

개발자는 API key가 특정 tenant에 속해 있고, 해당 key가 가진 subject identity로 RBAC 평가를 받게 하고 싶다.

```ts
@UseGuards(ApiKeysGuard, RbacGuard)
@Can('reports.read')
@Get('reports')
listReports() {
  return [];
}
```

### 3.4 테스트 작성자

테스트에서는 실제 DB 없이 role/permission matrix를 빠르게 검증하고 싶다.

```ts
await expectAllowed(rbac, {
  subject: user('user_1'),
  tenantId: 'tenant_1',
  permission: 'reports.read',
});

await expectDenied(rbac, {
  subject: user('user_2'),
  tenantId: 'tenant_1',
  permission: 'reports.write',
});
```

---

## 4. 핵심 개념

### 4.1 Subject

권한 평가 대상이다.

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

### 4.2 Tenant

권한이 적용되는 SaaS boundary다. MVP는 `tenantId: string`만 다룬다.

- `tenant: 'required'`: tenant가 없으면 deny
- `tenant: 'optional'`: tenant가 있으면 tenant-scoped 평가, 없으면 global 평가
- `tenant: 'none'`: global 권한만 평가

### 4.3 Permission

route나 operation에 필요한 atomic action이다. 문자열 key로 표현한다.

예시:

- `tenant.manage`
- `member.invite`
- `invoice.read`
- `invoice.write`
- `project.delete`
- `webhook.endpoint.create`

MVP의 permission matching 규칙:

1. exact match: `invoice.read` grants `invoice.read`
2. suffix wildcard: `invoice.*` grants `invoice.read`, `invoice.write`
3. global wildcard: `*` grants everything
4. implicit hierarchy는 없다. 예를 들어 `write`가 `read`를 자동 포함하지 않는다.

### 4.4 Role

permission 묶음이다.

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

Role scope:

- global role: 모든 tenant 또는 platform operation에 사용 가능
- tenant role: 특정 tenant 안에서만 사용 가능

### 4.5 Binding

subject가 특정 tenant/resource에서 role을 가진다는 사실이다.

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

Public assignment API:

```ts
export type AssignRoleInput = {
  tenantId?: string | null;
  subject: RbacSubject;
  resource?: RbacResourceRef;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
} & ({ roleId: string; roleKey?: never } | { roleKey: string; roleId?: never });
```

`RbacService.assignRole()` resolves `roleKey` to `roleId` before calling storage;
storage adapters receive `AssignRoleStorageInput` with `roleId`.

### 4.6 Resource scope

특정 resource에만 적용되는 권한 범위다.

예시: `user_1`은 `tenant_1` 안에서 `project_123`의 `project_admin`이다.

```ts
await rbac.assignRole({
  tenantId: 'tenant_1',
  subject: { type: 'user', id: 'user_1' },
  roleKey: 'project_admin',
  resource: { type: 'project', id: 'project_123' },
});
```

Route에서는 다음처럼 resource를 선언한다.

```ts
@Can('project.member.invite', {
  resource: { type: 'project', idParam: 'projectId' },
})
@Post(':projectId/invitations')
invite() {}
```

---

## 5. MVP 기능 요구사항

### 5.1 Dynamic module

패키지는 NestJS dynamic module을 제공한다.

```ts
RbacModule.forRoot({
  storage: new PrismaRbacStorage(prisma),
  tenant: {
    requiredByDefault: true,
  },
});
```

```ts
RbacModule.forRootAsync({
  inject: [PrismaService],
  useFactory: (prisma: PrismaService) => ({
    storage: new PrismaRbacStorage(prisma),
    subjectResolver: defaultHttpSubjectResolver(),
  }),
});
```

#### Acceptance criteria

- `RbacModule.forRoot()`가 `RbacService`, `RbacGuard`, options provider를 등록한다.
- `RbacModule.forRootAsync()`가 `useFactory`, `inject`, `imports`를 지원한다.
- `RbacService`는 host module에서 inject 가능하다.
- `RbacGuard`는 `APP_GUARD`로도 등록 가능해야 한다.

---

### 5.2 Decorators

#### Required decorators

```ts
@Can(permission: string, options?: RbacRequirementOptions)
@RequirePermission(permission: string, options?: RbacRequirementOptions)
@RequirePermissions(permissions: string[], options?: RbacRequirementOptions)
@RequireRole(roleKey: string, options?: RbacRequirementOptions)
@SkipRbac(reason?: string)
@CurrentRbacSubject()
```

`@Can()`과 `@RequirePermission()`은 같은 동작을 하는 alias다. 문서에서는 짧은 `@Can()`을 기본 예제로 사용한다.

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

#### Metadata behavior

- class-level metadata와 handler-level metadata를 모두 지원한다.
- handler-level requirement가 class-level requirement를 override하지 않는다. 기본적으로 누적한다.
- `@SkipRbac()`가 handler에 있으면 class-level requirement도 skip한다.
- `@SkipRbac()`는 명시적이어야 하며, global guard 사용 시 public route를 만들 때 사용한다.

#### Acceptance criteria

- `Reflector.getAllAndMerge()` 또는 동등한 로직으로 class/handler 요구사항을 합친다.
- `@SkipRbac()`가 있으면 guard는 true를 반환한다.
- metadata가 없고 `requireMetadata` 옵션이 false이면 allow한다.
- metadata가 없고 `requireMetadata` 옵션이 true이면 deny한다.

---

### 5.3 Guard

`RbacGuard`는 NestJS `CanActivate`를 구현한다.

Evaluation sequence:

1. `@SkipRbac()` 확인
2. class/handler의 RBAC requirement 수집
3. subject resolution
4. tenant resolution
5. resource resolution
6. `RbacService.can()` 또는 `RbacService.evaluate()` 호출
7. decision이 deny이면 stable error code를 가진 exception throw
8. optional audit/event emit

```ts
@Injectable()
export class RbacGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // implementation
  }
}
```

#### Error mapping

- subject 없음: `UnauthorizedException`, code `RBAC_SUBJECT_MISSING`
- tenant required인데 tenant 없음: `ForbiddenException`, code `RBAC_TENANT_MISSING`
- permission denied: `ForbiddenException`, code `RBAC_PERMISSION_DENIED`
- storage 장애: `InternalServerErrorException`, code `RBAC_STORAGE_ERROR`

#### Acceptance criteria

- subject가 없고 protected route이면 401이다.
- tenant required인데 tenant가 없으면 403이다.
- role permission이 없으면 403이다.
- 권한이 있으면 route handler가 실행된다.
- guard는 request-scoped provider를 요구하지 않는다.

---

### 5.4 Subject resolver

기본 resolver는 HTTP request에서 다음 순서로 subject를 찾는다.

1. `request.rbacSubject`
2. `request.user`
3. `request.apiKeyContext`
4. `request.apiKey`

기본 `request.user` mapping:

```ts
function mapUserToSubject(user: unknown): RbacSubject | undefined {
  if (!user || typeof user !== 'object') return undefined;
  const id = user['id'] ?? user['sub'] ?? user['userId'];
  if (!id) return undefined;
  return {
    type: user['type'] ?? 'user',
    id: String(id),
    tenantId: user['tenantId'] ? String(user['tenantId']) : undefined,
    attributes: user as Record<string, unknown>,
  };
}
```

커스텀 resolver:

```ts
RbacModule.forRoot({
  storage,
  subjectResolver: async (ctx) => {
    const req = ctx.switchToHttp().getRequest();
    return { type: 'user', id: req.user.sub, tenantId: req.user.tenant_id };
  },
});
```

#### Acceptance criteria

- custom `subjectResolver`가 있으면 기본 resolver보다 우선한다.
- resolver가 `undefined`를 반환하면 protected route는 401이다.
- API key subject는 `{ type: 'api_key', id: keyId, tenantId }`로 평가될 수 있다.

---

### 5.5 Tenant resolver

기본 resolver는 다음 순서로 tenantId를 찾는다.

1. requirement option의 `tenant: 'none'`이면 tenant를 사용하지 않는다.
2. `subject.tenantId`
3. `request.tenantId`
4. `request.tenant?.id`
5. `request.headers['x-tenant-id']`
6. options의 `tenantResolver`

`@nestarc/tenancy` 통합은 optional helper로 제공한다. RBAC 패키지는 optional
peer package를 runtime import하지 않으므로 helper에는 consuming app이 사용하는
tenant context getter를 전달한다.

```ts
import { createNestarcTenancyResolver } from '@nestarc/rbac/integrations/tenancy';

const tenancyContext = {
  getTenantId: () => 'tenant_1',
};

RbacModule.forRoot({
  storage,
  tenantResolver: createNestarcTenancyResolver(() => tenancyContext.getTenantId()),
});
```

#### Acceptance criteria

- route option `tenant: 'required'`에서 tenant가 없으면 deny한다.
- route option `tenant: 'none'`이면 tenant-scoped role binding은 평가하지 않는다.
- `tenant.requiredByDefault`가 true이면 requirement마다 tenant 옵션이 없어도 required로 간주한다.
- tenant mismatch는 deny한다.

---

### 5.6 Resource resolver

지원할 resource declaration:

```ts
@Can('project.read', { resource: { type: 'project', idParam: 'projectId' } })
@Can('project.read', { resource: { type: 'project', idQuery: 'projectId' } })
@Can('project.read', { resource: { type: 'project', idHeader: 'x-project-id' } })
```

커스텀 resolver:

```ts
@Injectable()
export class ProjectResourceResolver implements RbacResourceResolver {
  async resolve(context: ExecutionContext): Promise<RbacResourceRef> {
    const req = context.switchToHttp().getRequest();
    return { type: 'project', id: req.params.projectId };
  }
}
```

```ts
@Can('project.update', { resource: ProjectResourceResolver })
@Patch(':projectId')
updateProject() {}
```

#### Acceptance criteria

- resource가 선언된 route에서는 matching resource binding만 허용한다.
- resource가 선언되지 않은 route에서는 unscoped binding만 평가한다.
- resource id를 resolve할 수 없으면 deny한다.

---

### 5.7 RbacService

서비스 API는 business logic에서도 사용 가능해야 한다.

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

`can()` result:

```ts
export interface RbacDecision {
  allowed: boolean;
  reason: RbacDecisionReason;
  subject: RbacSubject;
  tenantId?: string | null;
  permission?: string;
  permissions?: string[];
  mode?: 'any' | 'all';
  matchedRoleKeys?: string[];
  matchedPermissions?: string[];
  resource?: RbacResourceRef;
}

export type RbacDecisionReason =
  | 'allowed_by_role_permission'
  | 'denied_subject_missing'
  | 'denied_tenant_missing'
  | 'denied_no_matching_role'
  | 'denied_no_matching_permission'
  | 'denied_role_expired'
  | 'denied_resource_mismatch'
  | 'denied_storage_error';
```

#### Acceptance criteria

- `can()`은 exception을 던지지 않고 decision object를 반환한다. 단, storage 장애는 options에 따라 throw 가능하되 기본은 deny decision이다.
- `assertCan()`은 denied decision이면 `RbacPermissionDeniedError`를 throw한다.
- service-level API는 HTTP가 없어도 동작한다.

---

### 5.8 Storage adapter

MVP storage adapter:

1. `InMemoryRbacStorage`
2. `PrismaRbacStorage`

Storage contract:

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

  listEffectivePermissions(input: ListEffectivePermissionsInput): Promise<RbacEffectivePermission[]>;
}
```

`listEffectivePermissions()`는 guard hot path에서 사용한다.

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

#### Acceptance criteria

- 모든 storage adapter는 동일 contract test suite를 통과한다.
- in-memory adapter는 process-local test/dev 용도임을 문서화한다.
- Prisma adapter는 transaction을 사용하는 write operation을 제공한다.
- active binding만 평가한다. `revokedAt`이 있거나 `expiresAt < now`이면 제외한다.

---

## 6. Prisma/PostgreSQL 데이터 모델

### 6.1 Prisma schema draft

```prisma
enum RbacSubjectType {
  user
  api_key
  service_account
}

model RbacRole {
  id          String   @id @default(cuid())
  tenantId    String?  @map("tenant_id")
  key         String
  name        String?
  description String?
  isSystem    Boolean  @default(false) @map("is_system")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  permissions RbacRolePermission[]
  bindings    RbacRoleBinding[]

  @@index([tenantId, key])
  @@map("rbac_roles")
}

model RbacPermission {
  id        String   @id @default(cuid())
  key       String   @unique(map: "rbac_permissions_key_unique")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  roles RbacRolePermission[]

  @@map("rbac_permissions")
}

model RbacRolePermission {
  roleId       String @map("role_id")
  permissionId String @map("permission_id")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @default(now()) @updatedAt @map("updated_at")

  role       RbacRole       @relation(fields: [roleId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  permission RbacPermission @relation(fields: [permissionId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@id([roleId, permissionId])
  @@index([permissionId], map: "rbac_role_permissions_permission_idx")
  @@map("rbac_role_permissions")
}

model RbacRoleBinding {
  id           String   @id @default(cuid())
  tenantId     String?  @map("tenant_id")
  subjectType  String   @map("subject_type")
  subjectId    String   @map("subject_id")
  roleId       String   @map("role_id")
  resourceType String?  @map("resource_type")
  resourceId   String?  @map("resource_id")
  expiresAt    DateTime? @map("expires_at")
  revokedAt    DateTime? @map("revoked_at")
  metadata     Json?
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  role RbacRole @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@index([tenantId, subjectType, subjectId])
  @@index([tenantId, resourceType, resourceId])
  @@index([roleId])
  @@map("rbac_role_bindings")
}
```

### 6.2 Required PostgreSQL indexes

Prisma만으로 partial unique index를 완전히 표현하기 어렵기 때문에 migration SQL에 아래 index를 포함한다.

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

### 6.3 Migration deliverables

- `prisma/schema.prisma.example`
- `prisma/migrations/0001_init_rbac.sql`
- `docs/prisma.md`

---

## 7. Authorization evaluation algorithm

Input:

```ts
export interface RbacCanInput {
  subject: RbacSubject;
  tenantId?: string | null;
  permission?: string;
  permissions?: string[];
  mode?: 'any' | 'all';
  resource?: RbacResourceRef;
  now?: Date;
}
```

Algorithm:

1. Normalize permission list.
2. Validate subject exists.
3. Resolve tenant mode.
4. Query effective permissions for subject + tenant + optional resource.
5. Filter expired bindings.
6. Filter resource mismatch.
7. Match permissions by exact, suffix wildcard, global wildcard.
8. For `mode: 'any'`, allow if at least one required permission matches.
9. For `mode: 'all'`, allow only if every required permission matches.
10. Return decision with matched role keys and reason.

Pseudo-code:

```ts
function matches(granted: string, required: string): boolean {
  if (granted === '*') return true;
  if (granted === required) return true;
  if (granted.endsWith('.*')) {
    const prefix = granted.slice(0, -1);
    return required.startsWith(prefix);
  }
  return false;
}
```

Resource matching:

```ts
function resourceMatches(binding, requested): boolean {
  if (!requested) {
    return !binding.resourceType && !binding.resourceId;
  }
  if (!binding.resourceType && !binding.resourceId) {
    return true;
  }
  return binding.resourceType === requested.type && binding.resourceId === requested.id;
}
```

Tenant matching:

- `tenantId` present: evaluate tenant-specific bindings for that tenant plus global bindings only if option `allowGlobalRolesInTenant` is true.
- `tenantId` absent and tenant mode is `none`: evaluate global bindings only.
- `tenantId` absent and tenant mode is `required`: deny.

Default `allowGlobalRolesInTenant`: `false` for security. Platform admin behavior must be explicitly enabled.

---

## 8. Public API examples

### 8.1 Minimal setup with in-memory storage

```ts
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

```ts
await rbac.createRole({
  tenantId: 'tenant_1',
  key: 'admin',
  permissions: ['invoice.*', 'member.invite'],
});

await rbac.assignRole({
  tenantId: 'tenant_1',
  subject: { type: 'user', id: 'user_1' },
  roleKey: 'admin',
});
```

```ts
@UseGuards(AuthGuard, RbacGuard)
@Can('invoice.read')
@Get('invoices/:id')
findInvoice() {}
```

### 8.2 Global guard setup

```ts
@Module({
  imports: [RbacModule.forRoot({ storage })],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
  ],
})
export class AppModule {}
```

```ts
@SkipRbac('Health checks must be public')
@Get('/health')
health() {
  return { ok: true };
}
```

### 8.3 Service-level check

```ts
await this.rbac.assertCan({
  subject: { type: 'user', id: userId },
  tenantId,
  permission: 'billing.invoice.refund',
  resource: { type: 'invoice', id: invoiceId },
});
```

---

## 9. Optional integrations

### 9.1 `@nestarc/tenancy`

`@nestarc/tenancy`는 RLS, Prisma extension, AsyncLocalStorage tenant context, fail-closed mode, testing utilities를 제공한다. RBAC는 이를 optional integration으로 활용한다.

Deliverables:

- `@nestarc/rbac/integrations/tenancy`
- `createTenancyTenantResolver(getTenantId)` and PRD-compatible alias `createNestarcTenancyResolver(getTenantId)`
- documented `withTenantRbac()` test helper recipe

Expected behavior:

- tenancy context에서 tenantId를 읽을 수 있으면 RBAC tenant resolver가 사용한다.
- tenant required route에서 tenant context가 없으면 deny한다.
- `withoutTenant()` 같은 admin bypass 상황에서는 route가 `tenant: 'none'`을 명시해야 한다.

### 9.2 `@nestarc/api-keys`

`@nestarc/api-keys`는 tenant-scoped API key, `ApiKeysGuard`, `ApiKeyContext`, scope system을 제공한다. RBAC는 API key를 subject로 평가할 수 있어야 한다.

Deliverables:

- `@nestarc/rbac/integrations/api-keys`
- `createApiKeySubjectResolver()`
- docs recipe: `ApiKeysGuard + RbacGuard`

Expected behavior:

- API key context에 `keyId`와 `tenantId`가 있으면 `{ type: 'api_key', id: keyId, tenantId }`로 subject를 만든다.
- API key scope와 RBAC permission을 자동 merge하지 않는다. 자동 merge는 혼란을 만들 수 있으므로 향후 옵션으로 둔다.

### 9.3 `@nestarc/audit-log`

`@nestarc/audit-log`는 Prisma 자동 변경 추적, append-only PostgreSQL storage, sensitive field masking, manual logging API, multi-tenant integration을 제공한다. RBAC는 권한 변경 이벤트와 deny decision을 audit log에 남길 수 있어야 한다.

Deliverables:

- `RbacAuditLogger` interface
- default no-op logger
- docs recipe: audit-log integration

Events to log:

- `rbac.role.created`
- `rbac.role.updated`
- `rbac.role.deleted`
- `rbac.permission.granted`
- `rbac.permission.revoked`
- `rbac.role.assigned`
- `rbac.role.revoked`
- `rbac.permission.denied`

Do not log every allow decision by default. Allow logging is high-volume and should be opt-in.

---

## 10. Error model

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

- Error messages must not leak sensitive role membership details by default.
- `details` can include non-sensitive identifiers for logs/tests.
- HTTP exceptions from guard must include stable `code` in response body.

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

## 11. Security requirements

1. Protected routes deny by default when subject is missing.
2. Tenant-required routes deny by default when tenant is missing.
3. Resource-scoped requirements deny if resource cannot be resolved.
4. Revoked or expired role bindings are never evaluated as active.
5. Permission wildcard matching must be deterministic and simple.
6. No dynamic code evaluation.
7. No implicit privilege hierarchy except explicit wildcard.
8. Global roles must not apply inside tenants unless explicitly enabled.
9. Logs must not expose full subject attributes or sensitive metadata.
10. Service APIs must validate tenant/resource/subject inputs and reject empty IDs.

---

## 12. Performance requirements

MVP target:

- In-memory `RbacService.can()` p95 below 1ms for 100 roles and 1,000 permissions in local benchmark.
- Prisma adapter should issue one hot-path query for effective permissions when possible.
- Guard should not use request-scoped providers.
- Cache is optional and disabled by default in MVP.

Future cache option:

```ts
RbacModule.forRoot({
  storage,
  cache: {
    enabled: true,
    ttlMs: 30_000,
    keyStrategy: 'subject_tenant_resource',
  },
});
```

Cache invalidation is out of scope for MVP except process-local invalidation after writes.

---

## 13. Package exports

```ts
// root
export * from './rbac.module';
export * from './rbac.service';
export * from './rbac.guard';
export * from './decorators';
export * from './interfaces';
export * from './errors';
export * from './adapters/in-memory-rbac.storage';

// optional subpaths
export * from './adapters/prisma-rbac.storage'; // @nestarc/rbac/prisma
export * from './testing';                      // @nestarc/rbac/testing
export * from './integrations/tenancy';         // @nestarc/rbac/integrations/tenancy
export * from './integrations/api-keys';        // @nestarc/rbac/integrations/api-keys
```

Recommended `package.json` exports:

```json
{
  "name": "@nestarc/rbac",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./prisma": {
      "types": "./dist/prisma.d.ts",
      "import": "./dist/prisma.js",
      "require": "./dist/prisma.cjs"
    },
    "./testing": {
      "types": "./dist/testing.d.ts",
      "import": "./dist/testing.js",
      "require": "./dist/testing.cjs"
    }
  }
}
```

Codex should align this with existing nestarc package conventions if they differ.

---

## 14. Repository structure

```txt
src/
  index.ts
  rbac.module.ts
  rbac.service.ts
  rbac.guard.ts
  constants.ts
  decorators/
    can.decorator.ts
    require-permission.decorator.ts
    require-role.decorator.ts
    skip-rbac.decorator.ts
    current-rbac-subject.decorator.ts
    index.ts
  interfaces/
    module-options.ts
    subject.ts
    role.ts
    permission.ts
    binding.ts
    resource.ts
    decision.ts
    storage.ts
    resolvers.ts
    audit.ts
    index.ts
  adapters/
    in-memory-rbac.storage.ts
    prisma-rbac.storage.ts
  errors/
    rbac.error.ts
    http-error.mapper.ts
    index.ts
  integrations/
    tenancy.ts
    api-keys.ts
  testing/
    test-rbac.module.ts
    storage-contract.ts
    expect-allowed.ts
    fixtures.ts
    index.ts
  utils/
    permission-matcher.ts
    normalize.ts
    clock.ts
prisma/
  schema.prisma.example
  migrations/
    0001_init_rbac.sql
examples/
  basic-http/
  api-keys/
  resource-scoped/
docs/
  installation.md
  guards.md
  prisma.md
  testing.md
  integrations.md
README.md
CHANGELOG.md
```

---

## 15. Testing requirements

### 15.1 Unit tests

- permission matcher
- decorator metadata
- subject resolver
- tenant resolver
- resource resolver
- guard decision mapping
- service role/permission CRUD
- in-memory storage

### 15.2 Storage contract tests

Each adapter must pass the same tests.

Required scenarios:

1. create role with permissions
2. upsert role updates name/description without deleting permissions unexpectedly
3. grant permission idempotently
4. revoke permission idempotently
5. assign role idempotently
6. revoke role idempotently
7. expired binding not effective
8. revoked binding not effective
9. tenant mismatch denies
10. resource-scoped binding only applies to matching resource
11. global binding does not apply in tenant by default
12. wildcard permission works

### 15.3 E2E tests

Create a small Nest test app with routes:

- `GET /health` with `@SkipRbac()`
- `GET /reports` with `@Can('reports.read')`
- `POST /reports` with `@Can('reports.write')`
- `POST /projects/:projectId/invitations` with resource-scoped permission

Test matrix:

| Scenario | Expected |
|---|---:|
| no subject | 401 |
| subject but no tenant on tenant-required route | 403 |
| subject with wrong tenant role | 403 |
| subject with viewer role and read permission | 200 |
| subject with viewer role and write request | 403 |
| subject with resource binding for matching project | 201/200 |
| subject with resource binding for different project | 403 |

### 15.4 Coverage target

- Statements: >= 90%
- Branches: >= 85%
- Permission matcher and guard: >= 95%, enforced through `vitest.config.ts`

---

## 16. Documentation requirements

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

Docs site pages:

- `Introduction`
- `Installation`
- `Guards & Decorators`
- `Roles & Permissions`
- `Tenancy`
- `Resource Scoping`
- `Prisma Adapter`
- `Testing`
- `Integrations`
- `Errors`

---

## 17. Milestones and implementation tickets

### Milestone 0: Repository skeleton

**Ticket 0.1 — Initialize package**

- Set package name to `@nestarc/rbac`.
- Add TypeScript build config.
- Add test runner.
- Add lint/format scripts.
- Add root exports.

Acceptance:

- `npm test` passes with placeholder test.
- `npm run build` emits declarations.

**Ticket 0.2 — Define interfaces**

- Add subject, tenant, role, permission, binding, resource, decision, storage interfaces.
- Add stable error codes.

Acceptance:

- TypeScript compiles.
- Public interfaces exported from root.

### Milestone 1: Core authorization engine

**Ticket 1.1 — Permission matcher**

- Implement exact/wildcard matching.
- Add tests for `*`, `invoice.*`, exact match, non-match.

Acceptance:

- Matcher has 100% branch coverage.

**Ticket 1.2 — In-memory storage**

- Implement role CRUD, permission grant/revoke, binding assign/revoke, effective permission listing.
- Make operations idempotent where specified.

Acceptance:

- In-memory storage passes contract tests.

**Ticket 1.3 — RbacService**

- Implement `can()`, `assertCan()`, create/update/delete role, grant/revoke permission, assign/revoke role.

Acceptance:

- Service tests cover allow, deny, tenant mismatch, resource mismatch, expired binding, revoked binding.

### Milestone 2: NestJS integration

**Ticket 2.1 — Decorators**

- Implement `@Can`, `@RequirePermission`, `@RequirePermissions`, `@RequireRole`, `@SkipRbac`, `@CurrentRbacSubject`.

Acceptance:

- Metadata can be read at class and handler level.
- Skip metadata wins.

**Ticket 2.2 — Resolvers**

- Implement default HTTP subject resolver.
- Implement default tenant resolver.
- Implement resource resolver for param/query/header.

Acceptance:

- Unit tests cover resolver precedence and missing values.

**Ticket 2.3 — RbacGuard**

- Implement guard evaluation flow.
- Map errors to Nest HTTP exceptions.

Acceptance:

- E2E tests pass for health/read/write/resource routes.

**Ticket 2.4 — RbacModule**

- Implement `forRoot` and `forRootAsync`.

Acceptance:

- `RbacService` and `RbacGuard` can be injected.
- Module works with `APP_GUARD`.

### Milestone 3: Prisma adapter

**Ticket 3.1 — Prisma schema and SQL migration**

- Add schema example.
- Add PostgreSQL SQL migration with partial unique indexes.

Acceptance:

- Docs explain how to copy models into app schema.

**Ticket 3.2 — PrismaRbacStorage**

- Implement adapter using a generic Prisma client.
- Avoid requiring generated Prisma types from the package consumer.

Acceptance:

- Adapter passes contract tests against PostgreSQL test database.
- If DB test is not available in CI, mark integration tests separately and document command.

### Milestone 4: Testing utilities and docs

**Ticket 4.1 — Testing utilities**

- Implement `TestRbacModule`.
- Implement `expectAllowed`, `expectDenied`.
- Add fixtures: `user()`, `apiKey()`, `serviceAccount()`.

Acceptance:

- README shows a complete test example.

**Ticket 4.2 — README and docs**

- Add quickstart.
- Add API reference table.
- Add integration recipes.

Acceptance:

- A developer can copy-paste quickstart into a NestJS app and run a protected route.

### Milestone 5: Optional integrations

**Ticket 5.1 — Tenancy integration helper**

- Add helper under subpath.
- Keep `@nestarc/tenancy` optional.

Acceptance:

- Package does not require `@nestarc/tenancy` unless helper is imported.

**Ticket 5.2 — API keys integration helper**

- Add helper under subpath.
- Keep `@nestarc/api-keys` optional.

Acceptance:

- `ApiKeysGuard + RbacGuard` recipe works in example app.

**Ticket 5.3 — Audit logger interface**

- Add no-op logger and interface.
- Emit/log write events and denied decisions.

Acceptance:

- Tests verify deny event emission without requiring `@nestarc/audit-log`.

---

## 18. MVP release criteria

Version `0.1.0` can be released when all are true.

- `RbacModule.forRoot` and `forRootAsync` work.
- `@Can()` and `RbacGuard` work in HTTP controllers.
- In-memory adapter works and passes contract tests.
- Prisma adapter works or is clearly marked beta with integration tests.
- Tenant-required fail-closed behavior is tested.
- Resource-scoped role binding is tested.
- Stable error codes are documented.
- README includes complete quickstart.
- Package exports are typed.
- CI runs build, lint, unit tests.

Version `0.2.0` target:

- Prisma adapter production-ready.
- Docs site pages added.
- API key and tenancy recipes verified.
- Audit integration recipe added.

---

## 19. Open questions

1. Should global roles apply inside tenants by default? PRD recommendation: no.
2. Should direct subject permissions be supported in MVP? PRD recommendation: no, role binding only.
3. Should permission strings use `resource.action` or `resource:action`? PRD recommendation: dot notation, because wildcard prefix matching is simple.
4. Should role hierarchy exist? PRD recommendation: not in MVP.
5. Should GraphQL be supported in MVP? PRD recommendation: only via custom resolver; official GraphQL helper later.
6. Should Prisma schema use enum for subject type? PRD recommendation: storage accepts string, Prisma example uses string for extensibility.

---

## 20. References reviewed

- NestJS Guards documentation: https://docs.nestjs.com/guards
- NestJS Authorization documentation: https://docs.nestjs.com/security/authorization
- nestarc Community roadmap: https://nestarc.dev/community/
- `@nestarc/tenancy` documentation: https://nestarc.dev/packages/tenancy/
- `@nestarc/api-keys` documentation: https://nestarc.dev/packages/api-keys/
- `@nestarc/audit-log` documentation: https://nestarc.dev/packages/audit-log/
- CASL documentation: https://casl.js.org/
- nest-access-control repository: https://github.com/nestjsx/nest-access-control
- nest-authz npm package: https://www.npmjs.com/package/nest-authz

---

## 21. Minimal Codex task prompt

아래 프롬프트를 Codex에 바로 넣을 수 있다.

```txt
Implement `@nestarc/rbac` MVP according to `nestarc-rbac-prd.md`.

Start with Milestone 0-2 only:
1. Define public TypeScript interfaces and stable error classes.
2. Implement permission matcher.
3. Implement InMemoryRbacStorage and contract tests.
4. Implement RbacService.can/assertCan and role/permission/binding APIs.
5. Implement decorators: @Can, @RequirePermission, @RequirePermissions, @RequireRole, @SkipRbac, @CurrentRbacSubject.
6. Implement default HTTP subject/tenant/resource resolvers.
7. Implement RbacGuard and RbacModule.forRoot/forRootAsync.
8. Add E2E Nest test app with protected routes.
9. Add README quickstart.

Do not implement authentication. Do not hard-depend on @nestarc/tenancy, @nestarc/api-keys, or @nestarc/audit-log yet. Keep integration hooks as interfaces. Ensure `npm test` and `npm run build` pass.
```
