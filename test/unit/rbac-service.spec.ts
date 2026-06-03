import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InMemoryRbacStorage,
  RbacPermissionDeniedError,
  RbacService,
  RbacStorageError,
  RbacSubjectMissingError,
  RbacTenantMissingError,
  type RbacModuleOptions,
  type RbacResourceRef,
  type RbacStorage,
} from '../../src';
import { user } from '../fixtures/subjects';

const tenantId = 'tenant_1';
const project: RbacResourceRef = { type: 'project', id: 'project_1' };
const now = new Date('2026-01-15T00:00:00.000Z');

describe('RbacService', () => {
  let storage: InMemoryRbacStorage;
  let service: RbacService;

  beforeEach(() => {
    storage = new InMemoryRbacStorage();
    service = new RbacService({ storage, tenant: { requiredByDefault: true } });
  });

  async function createAssignedRole(
    key: string,
    permissions: string[],
    subject = user('user_1', tenantId),
  ) {
    const role = await service.createRole({
      tenantId,
      key,
      name: key,
      permissions,
    });

    await service.assignRole({
      tenantId,
      subject,
      roleId: role.id,
      resource: project,
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    return role;
  }

  it('allows matching role permission', async () => {
    await createAssignedRole('report_admin', ['reports.read']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permission: 'reports.read',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: 'allowed_by_role_permission',
      tenantId,
      permission: 'reports.read',
      matchedRoleKeys: ['report_admin'],
      matchedPermissions: ['reports.read'],
      resource: project,
    });
  });

  it('denies missing subject', async () => {
    await expect(
      service.can({
        tenantId,
        permission: 'reports.read',
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_subject_missing',
      tenantId,
      permission: 'reports.read',
    });
  });

  it('denies tenant mismatch', async () => {
    await createAssignedRole('tenant_reporter', ['reports.read']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId: 'tenant_2',
        permission: 'reports.read',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_no_matching_permission',
      tenantId: 'tenant_2',
      matchedRoleKeys: [],
      matchedPermissions: [],
    });
  });

  it('allows suffix wildcard permission', async () => {
    await createAssignedRole('report_operator', ['reports.*']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permission: 'reports.export',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: 'allowed_by_role_permission',
      matchedRoleKeys: ['report_operator'],
      matchedPermissions: ['reports.*'],
    });
  });

  it('checks active role by key without requiring permissions', async () => {
    await createAssignedRole('support_agent', []);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        roleKey: 'support_agent',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: 'allowed_by_role',
      roleKey: 'support_agent',
      matchedRoleKeys: ['support_agent'],
    });
  });

  it('throws from assertCan on denied decision', async () => {
    await expect(
      service.assertCan({
        subject: user('user_1', tenantId),
        tenantId,
        permission: 'reports.read',
      }),
    ).rejects.toBeInstanceOf(RbacPermissionDeniedError);
  });

  it('throws typed errors for missing subject and tenant assertions', async () => {
    await expect(
      service.assertCan({
        tenantId,
        permission: 'reports.read',
      }),
    ).rejects.toBeInstanceOf(RbacSubjectMissingError);

    await expect(
      service.assertCan({
        subject: user('user_1'),
        tenantMode: 'required',
        permission: 'reports.read',
      }),
    ).rejects.toBeInstanceOf(RbacTenantMissingError);
  });

  it('denies empty permission arrays instead of allowing vacuously', async () => {
    await createAssignedRole('report_admin', ['reports.read']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permissions: [],
        mode: 'all',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_no_matching_permission',
      permissions: [],
      matchedRoleKeys: [],
      matchedPermissions: [],
    });
  });

  it('uses all mode by default for multiple permissions', async () => {
    await createAssignedRole('report_reader', ['reports.read']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permissions: ['reports.read', 'reports.write'],
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_no_matching_permission',
      mode: 'all',
      matchedRoleKeys: ['report_reader'],
      matchedPermissions: ['reports.read'],
    });
  });

  it('uses any mode by default for a single permission entry', async () => {
    await createAssignedRole('report_reader', ['reports.read']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permissions: ['reports.read'],
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: 'allowed_by_role_permission',
      mode: 'any',
      matchedRoleKeys: ['report_reader'],
      matchedPermissions: ['reports.read'],
    });
  });

  it('denies storage errors by default and throws when configured', async () => {
    const error = new Error('storage unavailable');
    const failingStorage = {
      listEffectivePermissions: vi.fn().mockRejectedValue(error),
    } as unknown as RbacStorage;

    const denyService = new RbacService({ storage: failingStorage });
    await expect(
      denyService.can({
        subject: user('user_1'),
        tenantMode: 'none',
        permission: 'reports.read',
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_storage_error',
    });

    const throwOptions: RbacModuleOptions = {
      storage: failingStorage,
      storageErrors: 'throw',
    };
    const throwService = new RbacService(throwOptions);

    await expect(
      throwService.can({
        subject: user('user_1'),
        tenantMode: 'none',
        permission: 'reports.read',
      }),
    ).rejects.toBeInstanceOf(RbacStorageError);
  });
});
