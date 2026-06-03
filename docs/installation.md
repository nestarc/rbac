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

