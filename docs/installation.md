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
`PrismaClient` constructor. RBAC 0.2.1 accepts Prisma 5, 6, or 7 clients.

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
