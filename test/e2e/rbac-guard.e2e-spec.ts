import 'reflect-metadata';

import { Controller, Get, Module, Post, UseGuards, type ExecutionContext } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Can,
  InMemoryRbacStorage,
  RbacGuard,
  RbacModule,
  SkipRbac,
  type RbacSubject,
} from '../../src';

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

  @UseGuards(RbacGuard)
  @Can('reports.read')
  @Get('/reports')
  readReports() {
    return { ok: true };
  }

  @UseGuards(RbacGuard)
  @Can('reports.write')
  @Post('/reports')
  writeReports() {
    return { ok: true };
  }

  @UseGuards(RbacGuard)
  @Can('project.member.invite', {
    resource: { type: 'project', idParam: 'projectId' },
  })
  @Post('/projects/:projectId/invitations')
  inviteProjectMember() {
    return { ok: true };
  }
}

describe('RbacGuard HTTP behavior', () => {
  let app: Awaited<ReturnType<TestingModule['createNestApplication']>>;
  let storage: InMemoryRbacStorage;

  const httpServer = (): App => app.getHttpServer() as App;

  beforeEach(async () => {
    storage = new InMemoryRbacStorage();

    @Module({
      imports: [
        RbacModule.forRoot({
          storage,
          tenant: { requiredByDefault: true },
          subjectResolver,
        }),
      ],
      controllers: [TestRbacController],
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
