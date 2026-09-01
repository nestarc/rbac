import 'reflect-metadata';

import {
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  type ExecutionContext,
  type MiddlewareConsumer,
  type NestMiddleware,
  type NestModule,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Can,
  InMemoryRbacStorage,
  RequireRole,
  RbacGuard,
  RbacModule,
  SkipRbac,
  type RbacSubject,
} from '../../src';
import { createAuditLogRbacLogger } from '../../src/integrations/audit-log';

type HeaderValue = string | string[] | undefined;

const tenantId = 'tenant_1';

const headerValue = (value: HeaderValue): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const subjectResolver = (context: ExecutionContext): RbacSubject | undefined => {
  const request = context.switchToHttp().getRequest<{ headers: Record<string, HeaderValue> }>();
  const userId = headerValue(request.headers['x-user-id']);

  if (userId === undefined || userId.trim() === '') {
    return undefined;
  }

  const resolvedTenantId = headerValue(request.headers['x-tenant-id']);

  return {
    type: 'user',
    id: userId,
    ...(resolvedTenantId !== undefined && resolvedTenantId.trim() !== ''
      ? { tenantId: resolvedTenantId }
      : {}),
  };
};

@Controller()
class TestRbacController {
  @SkipRbac('health check')
  @Get('/health')
  health() {
    return { ok: true };
  }

  @Can('reports.read')
  @Get('/reports')
  readReports() {
    return { ok: true };
  }

  @Can('reports.write')
  @Post('/reports')
  writeReports() {
    return { ok: true };
  }

  @Can('reports.read', { mode: 'sometimes' } as never)
  @Get('/invalid-requirement')
  invalidRequirement() {
    return { ok: true };
  }

  @Can('project.member.invite', {
    resource: { type: 'project', idParam: 'projectId' },
  })
  @Post('/projects/:projectId/invitations')
  inviteProjectMember() {
    return { ok: true };
  }

  @Get('/metadata-required')
  metadataRequired() {
    return { ok: true };
  }
}

@RequireRole('owner')
@Controller()
class StackedRbacController {
  @Can('reports.read')
  @Get('/stacked-requirements')
  readReportsAsOwner() {
    return { ok: true };
  }
}

@Injectable()
class ConflictingSubjectMiddleware implements NestMiddleware {
  use(request: Record<string, unknown>, _response: unknown, next: () => void): void {
    request.user = { id: 'principal_1', tenantId };
    request.apiKey = { keyId: 'principal_1', tenantId };
    next();
  }
}

@Controller()
class DefaultSubjectController {
  @Can('reports.read')
  @Get('/default-subject-conflict')
  readReports() {
    return { ok: true };
  }
}

@Module({
  imports: [
    RbacModule.forRoot({
      storage: new InMemoryRbacStorage(),
      tenant: { requiredByDefault: true },
      requireMetadata: true,
    }),
  ],
  controllers: [DefaultSubjectController],
  providers: [
    ConflictingSubjectMiddleware,
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
})
class DefaultSubjectTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ConflictingSubjectMiddleware).forRoutes(DefaultSubjectController);
  }
}

describe('RbacGuard HTTP behavior', () => {
  let app: Awaited<ReturnType<TestingModule['createNestApplication']>>;
  let storage: InMemoryRbacStorage;
  let trustedTenantId: string | undefined;
  let auditEvents: Record<string, unknown>[];

  const httpServer = (): App => app.getHttpServer() as App;

  beforeEach(async () => {
    storage = new InMemoryRbacStorage();
    trustedTenantId = undefined;
    auditEvents = [];

    @Module({
      imports: [
        RbacModule.forRoot({
          storage,
          tenant: { requiredByDefault: true },
          subjectResolver,
          tenantResolver: () => trustedTenantId,
          requireMetadata: true,
          logAllowedDecisions: true,
          auditLogger: createAuditLogRbacLogger({
            auditLog: {
              log: (event) => {
                auditEvents.push(event);
              },
            },
            source: 'rbac-e2e',
          }),
        }),
      ],
      controllers: [TestRbacController, StackedRbacController],
      providers: [{ provide: APP_GUARD, useClass: RbacGuard }],
    })
    class TestRbacModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestRbacModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const viewerRole = await storage.upsertRole({
      tenantId,
      key: 'viewer',
      permissions: ['reports.read'],
    });
    await storage.assignRole({
      tenantId,
      subject: { type: 'user', id: 'viewer_1' },
      roleId: viewerRole.id,
    });

    const projectAdminRole = await storage.upsertRole({
      tenantId,
      key: 'project_admin',
      permissions: ['project.member.invite'],
    });
    await storage.assignRole({
      tenantId,
      subject: { type: 'user', id: 'project_user_1' },
      roleId: projectAdminRole.id,
      resource: { type: 'project', id: 'project_1' },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('skips RBAC for health checks', async () => {
    await request(httpServer()).get('/health').expect(200).expect({ ok: true });
  });

  it('runs as APP_GUARD and rejects routes without RBAC metadata', async () => {
    const response = await request(httpServer()).get('/metadata-required').expect(403);

    expect(response.body).toMatchObject({ code: 'RBAC_PERMISSION_DENIED' });
  });

  it('returns 401 with RBAC_SUBJECT_MISSING when the subject is missing', async () => {
    const response = await request(httpServer())
      .get('/reports')
      .set('x-tenant-id', tenantId)
      .expect(401);

    expect(response.body).toMatchObject({ code: 'RBAC_SUBJECT_MISSING' });
  });

  it('returns 403 with RBAC_TENANT_MISSING when the required tenant is missing', async () => {
    const response = await request(httpServer())
      .get('/reports')
      .set('x-user-id', 'viewer_1')
      .expect(403);

    expect(response.body).toMatchObject({ code: 'RBAC_TENANT_MISSING' });
  });

  it('allows viewer report reads and denies viewer report writes', async () => {
    await request(httpServer())
      .get('/reports')
      .set('x-user-id', 'viewer_1')
      .set('x-tenant-id', tenantId)
      .expect(200)
      .expect({ ok: true });

    const response = await request(httpServer())
      .post('/reports')
      .set('x-user-id', 'viewer_1')
      .set('x-tenant-id', tenantId)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'RBAC_PERMISSION_DENIED' });
    expect(response.body).not.toHaveProperty('details');
  });

  it('keeps the HTTP denial and audit-log result aligned for stacked requirements', async () => {
    const response = await request(httpServer())
      .get('/stacked-requirements')
      .set('x-user-id', 'viewer_1')
      .set('x-tenant-id', tenantId)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'RBAC_PERMISSION_DENIED' });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      action: 'rbac.permission.denied',
      source: 'rbac-e2e',
      result: 'failure',
      actorType: 'user',
      actorId: 'viewer_1',
      tenantId,
      metadata: {
        reason: 'denied_no_matching_role',
        requirementIndex: 1,
        roleKey: 'owner',
      },
    });
    expect(JSON.stringify(auditEvents)).not.toContain('rbac.permission.allowed');
  });

  it('returns a stable configuration error for invalid runtime requirement metadata', async () => {
    const response = await request(httpServer())
      .get('/invalid-requirement')
      .set('x-user-id', 'viewer_1')
      .set('x-tenant-id', tenantId)
      .expect(500);

    expect(response.body).toEqual({
      message: 'RBAC configuration error',
      code: 'RBAC_CONFIG_ERROR',
    });
  });

  it('fails closed when the trusted tenant conflicts with the request identity', async () => {
    trustedTenantId = tenantId;
    const response = await request(httpServer())
      .get('/reports')
      .set('x-user-id', 'viewer_1')
      .set('x-tenant-id', 'tenant_2')
      .expect(403);

    expect(response.body).toMatchObject({ code: 'RBAC_PERMISSION_DENIED' });
  });

  it('allows project invitations only for the scoped project binding', async () => {
    await request(httpServer())
      .post('/projects/project_1/invitations')
      .set('x-user-id', 'project_user_1')
      .set('x-tenant-id', tenantId)
      .expect(201)
      .expect({ ok: true });

    const response = await request(httpServer())
      .post('/projects/project_2/invitations')
      .set('x-user-id', 'project_user_1')
      .set('x-tenant-id', tenantId)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'RBAC_PERMISSION_DENIED' });
  });
});

describe('RbacGuard default HTTP subject source policy', () => {
  it('returns RBAC_SUBJECT_MISSING before authorization for conflicting sources', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DefaultSubjectTestModule],
    }).compile();
    const app = moduleRef.createNestApplication();

    try {
      await app.init();
      const response = await request(app.getHttpServer() as App)
        .get('/default-subject-conflict')
        .expect(401);

      expect(response.body).toMatchObject({ code: 'RBAC_SUBJECT_MISSING' });
    } finally {
      await app.close();
    }
  });
});
