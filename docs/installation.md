# Installation

Install the package and required NestJS peer dependencies:

```bash
npm install @nestarc/rbac @nestjs/common @nestjs/core reflect-metadata rxjs
```

For PostgreSQL persistence, also install Prisma in the consuming app:

```bash
npm install @prisma/client @prisma/adapter-pg pg
npm install -D prisma
```

`@prisma/adapter-pg` and `pg` are required for a Prisma 7 direct PostgreSQL
connection. Prisma 5/6 applications can omit them and keep their existing
`PrismaClient` constructor. RBAC 0.2.x metadata accepts Prisma 5, 6, or 7;
Prisma 5.22.0, 6.19.3, and 7.10.0 have PostgreSQL 16 real-database evidence. See
[Compatibility and support](compatibility.md) before selecting a version.

NestJS 10, 11, and 12 are accepted by the peer range. Exact 12.0.1 packed
consumers run on Node 22 and 24; NestJS 12's ESM packages require a sufficiently
recent Node release even when the application remains CommonJS.

Prisma 8 preview packages do not expose the generated-client delegate shape used
by `PrismaRbacStorage`. Keep this adapter on Prisma 5-7 until a stable Prisma 8
adapter contract is published and passes the real-database gate.

The root package exports dependency-free RBAC primitives:

```ts
import {
  InMemoryRbacStorage,
  NoopRbacAuditLogger,
  RbacGuard,
  RbacModule,
  RbacService,
} from '@nestarc/rbac';
```

Optional capabilities use subpath exports so they do not add runtime requirements
to applications that do not use them:

```ts
import { PrismaRbacStorage } from '@nestarc/rbac/prisma';
import { TestRbacModule, expectAllowed, expectDenied, rbacUser } from '@nestarc/rbac/testing';
import { createApiKeySubjectResolver } from '@nestarc/rbac/integrations/api-keys';
import { createTenancyTenantResolver } from '@nestarc/rbac/integrations/tenancy';
```

The package does not configure authentication. Register an auth guard, middleware,
or interceptor that attaches a subject to `request.rbacSubject`, `request.user`, or
a custom `subjectResolver`.
