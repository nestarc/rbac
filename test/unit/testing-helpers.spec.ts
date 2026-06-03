import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryRbacStorage,
  RBAC_OPTIONS,
  RBAC_STORAGE,
  RbacService,
  type RbacModuleOptions,
  type RbacSubjectResolver,
} from '../../src';
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
    expect(rbacServiceAccount('svc_1')).toEqual({
      type: 'service_account',
      id: 'svc_1',
    });
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
    expect(moduleRef.get(RBAC_STORAGE)).toBeInstanceOf(InMemoryRbacStorage);
  });

  it('uses a fixed subject as the default subject resolver', async () => {
    const subject = rbacUser('user_1', 'tenant_1');
    const moduleRef = await Test.createTestingModule({
      imports: [TestRbacModule.forRoot({ subject })],
    }).compile();
    const options = moduleRef.get<RbacModuleOptions>(RBAC_OPTIONS);

    await expect(
      Promise.resolve(options.subjectResolver?.({} as Parameters<RbacSubjectResolver>[0])),
    ).resolves.toBe(subject);
  });

  it('prefers a custom subject resolver over a fixed subject', async () => {
    const resolvedSubject = rbacApiKey('key_1', 'tenant_1');
    const subjectResolver = vi.fn<RbacSubjectResolver>(() => resolvedSubject);
    const moduleRef = await Test.createTestingModule({
      imports: [
        TestRbacModule.forRoot({
          subject: rbacUser('user_1', 'tenant_1'),
          subjectResolver,
        }),
      ],
    }).compile();
    const options = moduleRef.get<RbacModuleOptions>(RBAC_OPTIONS);
    const context = {} as Parameters<RbacSubjectResolver>[0];

    await expect(Promise.resolve(options.subjectResolver?.(context))).resolves.toBe(
      resolvedSubject,
    );
    expect(subjectResolver).toHaveBeenCalledWith(context);
  });

  it('uses custom storage when provided', async () => {
    const storage = new InMemoryRbacStorage();
    const moduleRef = await Test.createTestingModule({
      imports: [TestRbacModule.forRoot({ storage })],
    }).compile();

    expect(moduleRef.get(RBAC_STORAGE)).toBe(storage);
  });

  it('asserts allowed and denied decisions without depending on test framework globals', async () => {
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

    await expect(
      expectAllowed(rbac, {
        subject: rbacUser('user_1', 'tenant_1'),
        tenantId: 'tenant_1',
        permission: 'reports.read',
      }),
    ).resolves.toMatchObject({ allowed: true, reason: 'allowed_by_role_permission' });
    await expect(
      expectDenied(
        rbac,
        {
          subject: rbacUser('user_1', 'tenant_1'),
          tenantId: 'tenant_1',
          permission: 'reports.write',
        },
        'denied_no_matching_permission',
      ),
    ).resolves.toMatchObject({ allowed: false, reason: 'denied_no_matching_permission' });
  });

  it('throws plain errors when decision expectations fail', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestRbacModule.forRoot()],
    }).compile();
    const rbac = moduleRef.get(RbacService);
    const subject = rbacUser('user_1', 'tenant_1');
    const role = await rbac.createRole({
      tenantId: 'tenant_1',
      key: 'viewer',
      permissions: ['reports.read'],
    });
    await rbac.assignRole({ tenantId: 'tenant_1', subject, roleId: role.id });

    await expect(
      expectAllowed(rbac, {
        subject,
        tenantId: 'tenant_1',
        permission: 'reports.write',
      }),
    ).rejects.toThrow('Expected RBAC decision to allow, received denied_no_matching_permission');
    await expect(
      expectDenied(rbac, {
        subject,
        tenantId: 'tenant_1',
        permission: 'reports.read',
      }),
    ).rejects.toThrow('Expected RBAC decision to deny, received allowed decision');
    await expect(
      expectDenied(
        rbac,
        {
          subject,
          tenantId: 'tenant_1',
          permission: 'reports.write',
        },
        'denied_tenant_missing',
      ),
    ).rejects.toThrow(
      'Expected RBAC denial reason denied_tenant_missing, received denied_no_matching_permission',
    );
  });
});
