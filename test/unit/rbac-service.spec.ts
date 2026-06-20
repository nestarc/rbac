import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InMemoryRbacStorage,
  RbacConfigError,
  RbacPermissionDeniedError,
  RbacRoleNotFoundError,
  RbacService,
  RbacStorageError,
  type RbacAuditEvent,
  type RbacCanInput,
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

  it('adds safe details to allowed permission decisions', async () => {
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
      details: {
        requirement: {
          type: 'permission',
          permissions: ['reports.read'],
          mode: 'any',
        },
        matched: {
          roleKeys: ['report_admin'],
          permissions: ['reports.read'],
        },
        evaluationPath: [{ code: 'permission_matched', outcome: 'allow' }],
      },
    });
  });

  it('adds missing permission details to denied permission decisions', async () => {
    await createAssignedRole('report_reader', ['reports.read']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permissions: ['reports.read', 'reports.write'],
        mode: 'all',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      details: {
        requirement: {
          type: 'permission',
          permissions: ['reports.read', 'reports.write'],
          mode: 'all',
        },
        matched: {
          roleKeys: ['report_reader'],
          permissions: ['reports.read'],
        },
        missing: {
          permissions: ['reports.write'],
        },
        evaluationPath: [{ code: 'permission_missing', outcome: 'deny' }],
      },
    });
  });

  it('adds missing role details to denied role decisions', async () => {
    await createAssignedRole('viewer', ['reports.read']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        roleKey: 'owner',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      details: {
        requirement: {
          type: 'role',
          roleKeys: ['owner'],
        },
        missing: {
          roleKeys: ['owner'],
        },
        evaluationPath: [{ code: 'role_missing', outcome: 'deny' }],
      },
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

  it('adds missing tenant details to tenant-required denials', async () => {
    await expect(
      service.can({
        subject: user('user_1'),
        tenantMode: 'required',
        permission: 'reports.read',
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_tenant_missing',
      details: {
        missing: { tenant: true },
        evaluationPath: [{ code: 'tenant_missing', outcome: 'deny' }],
      },
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

  it('assigns roles by role key through the public service API', async () => {
    const role = await service.createRole({
      tenantId,
      key: 'report_reader',
      name: 'Report reader',
      permissions: ['reports.read'],
    });

    const binding = await service.assignRole({
      tenantId,
      subject: user('user_1', tenantId),
      roleKey: 'report_reader',
      resource: project,
    });

    expect(binding.roleId).toBe(role.id);
    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permission: 'reports.read',
        resource: project,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: 'allowed_by_role_permission',
      matchedRoleKeys: ['report_reader'],
    });
  });

  it('rejects role-key assignments when the role does not exist', async () => {
    await expect(
      service.assignRole({
        tenantId,
        subject: user('user_1', tenantId),
        roleKey: 'missing_role',
      }),
    ).rejects.toBeInstanceOf(RbacRoleNotFoundError);
  });

  it('rejects tenant-mismatched role assignments when strict write validation is enabled', async () => {
    const strictService = new RbacService({
      storage,
      writeValidation: { rejectTenantMismatch: true },
    });
    const role = await strictService.createRole({
      tenantId,
      key: 'tenant_viewer',
      permissions: ['reports.read'],
    });

    await expect(
      strictService.assignRole({
        tenantId: 'tenant_2',
        subject: user('user_1', 'tenant_2'),
        roleId: role.id,
      }),
    ).rejects.toMatchObject({
      details: {
        reason: 'role_tenant_mismatch',
        roleTenantId: tenantId,
        bindingTenantId: 'tenant_2',
      },
    });
  });

  it('rejects resource-scoped bindings without tenant when strict write validation is enabled', async () => {
    const strictService = new RbacService({
      storage,
      writeValidation: { rejectResourceWithoutTenant: true },
    });
    const role = await strictService.createRole({
      tenantId: null,
      key: 'global_project_viewer',
      permissions: ['project.read'],
    });

    await expect(
      strictService.assignRole({
        tenantId: null,
        subject: user('user_1'),
        roleId: role.id,
        resource: project,
      }),
    ).rejects.toMatchObject({
      details: {
        reason: 'resource_binding_requires_tenant',
      },
    });
  });

  it('allows global role bindings inside tenants unless explicitly rejected', async () => {
    const strictService = new RbacService({
      storage,
      writeValidation: { rejectTenantMismatch: true },
    });
    const role = await strictService.createRole({
      tenantId: null,
      key: 'global_support',
      permissions: ['support.read'],
    });

    await expect(
      strictService.assignRole({
        tenantId,
        subject: user('user_1', tenantId),
        roleId: role.id,
      }),
    ).resolves.toMatchObject({
      tenantId,
      roleId: role.id,
    });
  });

  it('publishes change events after successful role, permission, and binding writes', async () => {
    const publish = vi.fn<NonNullable<RbacModuleOptions['changePublisher']>['publish']>();
    const eventService = new RbacService({
      storage: new InMemoryRbacStorage(),
      now: () => now,
      changePublisher: { publish },
    });

    const role = await eventService.createRole({
      tenantId,
      key: 'event_viewer',
      permissions: ['reports.read'],
    });
    await eventService.grantPermission({ roleId: role.id, permission: 'reports.export' });
    const binding = await eventService.assignRole({
      tenantId,
      subject: user('user_1', tenantId),
      roleId: role.id,
      resource: project,
    });

    expect(publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'role.created',
        occurredAt: now,
        tenantId,
        roleId: role.id,
        roleKey: 'event_viewer',
        permissions: ['reports.read'],
      }),
    );
    expect(publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'permission.granted',
        occurredAt: now,
        roleId: role.id,
        permissions: ['reports.export'],
      }),
    );
    expect(publish).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: 'role.assigned',
        occurredAt: now,
        tenantId,
        subject: { type: 'user', id: 'user_1' },
        roleId: role.id,
        resource: project,
        bindingId: binding.id,
      }),
    );
  });

  it('does not publish change events when storage writes fail', async () => {
    const publish = vi.fn<NonNullable<RbacModuleOptions['changePublisher']>['publish']>();
    const failingStorage = {
      findRole: vi.fn(() => Promise.resolve(null)),
      listRoles: vi.fn(() => Promise.resolve([])),
      upsertRole: vi.fn(() => Promise.reject(new Error('storage failed'))),
      deleteRole: vi.fn(() => Promise.resolve(undefined)),
      grantPermission: vi.fn(() => Promise.resolve(undefined)),
      revokePermission: vi.fn(() => Promise.resolve(undefined)),
      listRolePermissions: vi.fn(() => Promise.resolve([])),
      assignRole: vi.fn(() => Promise.resolve({
        id: 'binding_1',
        tenantId: null,
        subjectType: 'user',
        subjectId: 'user_1',
        roleId: 'role_1',
      })),
      revokeRole: vi.fn(() => Promise.resolve(undefined)),
      listBindings: vi.fn(() => Promise.resolve([])),
      listEffectiveRoles: vi.fn(() => Promise.resolve([])),
      listEffectivePermissions: vi.fn(() => Promise.resolve([])),
    } satisfies RbacStorage;
    const eventService = new RbacService({
      storage: failingStorage,
      changePublisher: { publish },
    });

    await expect(
      eventService.createRole({
        tenantId,
        key: 'failed_role',
        permissions: [],
      }),
    ).rejects.toThrow('storage failed');
    expect(publish).not.toHaveBeenCalled();
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

  it('returns undefined from assertCan on allowed decisions', async () => {
    await createAssignedRole('assert_reader', ['reports.read']);

    await expect(
      service.assertCan({
        subject: user('user_1', tenantId),
        tenantId,
        permission: 'reports.read',
        resource: project,
        now,
      }),
    ).resolves.toBeUndefined();
  });

  it('throws permission denied errors for all denied assertions', async () => {
    await expect(
      service.assertCan({
        tenantId,
        permission: 'reports.read',
      }),
    ).rejects.toBeInstanceOf(RbacPermissionDeniedError);

    await expect(
      service.assertCan({
        subject: user('user_1'),
        tenantMode: 'required',
        permission: 'reports.read',
      }),
    ).rejects.toBeInstanceOf(RbacPermissionDeniedError);
  });

  it('does not expose full subject attributes in assertion error details', async () => {
    await expect(
      service.assertCan({
        subject: {
          type: 'user',
          id: 'user_private',
          tenantId,
          attributes: { email: 'private@example.com' },
        },
        tenantId,
        permission: 'reports.read',
      }),
    ).rejects.toMatchObject({
      details: {
        decision: {
          subject: { type: 'user', id: 'user_private', tenantId },
        },
      },
    });

    await expect(
      service.assertCan({
        subject: {
          type: 'user',
          id: 'user_private',
          tenantId,
          attributes: { email: 'private@example.com' },
        },
        tenantId,
        permission: 'reports.read',
      }),
    ).rejects.not.toThrow(/private@example\.com/);
  });

  it('rejects mixed role and permission requirement families', async () => {
    await createAssignedRole('mixed_reader', ['reports.read']);

    const mixedDecision = service.can({
      subject: user('user_1', tenantId),
      tenantId,
      roleKey: 'mixed_reader',
      permission: 'reports.delete',
      resource: project,
      now,
    } as RbacCanInput);

    await expect(mixedDecision).rejects.toBeInstanceOf(RbacConfigError);
    await expect(mixedDecision).rejects.toMatchObject({
      details: {
        reason: 'can() accepts exactly one requirement family per call',
      },
    });
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

  it('requires both permission and permissions entries in all mode', async () => {
    await createAssignedRole('report_reader', ['reports.read']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permission: 'reports.read',
        permissions: ['reports.write'],
        mode: 'all',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_no_matching_permission',
      permissions: ['reports.read', 'reports.write'],
      matchedRoleKeys: ['report_reader'],
      matchedPermissions: ['reports.read'],
    });

    await createAssignedRole('report_writer', ['reports.write']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permission: 'reports.read',
        permissions: ['reports.write'],
        mode: 'all',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: 'allowed_by_role_permission',
      permissions: ['reports.read', 'reports.write'],
      matchedRoleKeys: ['report_reader', 'report_writer'],
      matchedPermissions: ['reports.read', 'reports.write'],
    });
  });

  it('uses all mode by default for mixed permission and permissions entries', async () => {
    await createAssignedRole('report_reader', ['reports.read']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permission: 'reports.read',
        permissions: ['reports.write'],
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_no_matching_permission',
      mode: 'all',
      permissions: ['reports.read', 'reports.write'],
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

  it('falls back to subject tenant when tenantId is omitted', async () => {
    await createAssignedRole('report_reader', ['reports.read']);

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        permission: 'reports.read',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: 'allowed_by_role_permission',
      tenantId,
      matchedRoleKeys: ['report_reader'],
      matchedPermissions: ['reports.read'],
    });
  });

  it('denies explicit null tenantId when tenant mode is required', async () => {
    const globalRole = await service.createRole({
      tenantId: null,
      key: 'global_reader',
      name: 'global_reader',
      permissions: ['system.read'],
    });
    await service.assignRole({
      tenantId: null,
      subject: user('user_1', tenantId),
      roleId: globalRole.id,
    });

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId: null,
        permission: 'system.read',
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_tenant_missing',
      tenantId: null,
    });
  });

  it('allows explicit null tenantId for route-level global checks', async () => {
    const globalRole = await service.createRole({
      tenantId: null,
      key: 'global_reader',
      name: 'global_reader',
      permissions: ['system.read'],
    });
    await service.assignRole({
      tenantId: null,
      subject: user('user_1', tenantId),
      roleId: globalRole.id,
    });

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId: null,
        tenantMode: 'none',
        permission: 'system.read',
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: 'allowed_by_role_permission',
      tenantId: null,
      matchedRoleKeys: ['global_reader'],
      matchedPermissions: ['system.read'],
    });
  });

  it('rejects invalid write API identifiers before storage writes', async () => {
    const writeStorage = {
      findRole: vi.fn(() => Promise.resolve(null)),
      listRoles: vi.fn(() => Promise.resolve([])),
      upsertRole: vi.fn(() => Promise.resolve({
        id: 'role_1',
        key: 'role',
        tenantId: null,
        permissions: [],
      })),
      deleteRole: vi.fn(() => Promise.resolve(undefined)),
      grantPermission: vi.fn(() => Promise.resolve(undefined)),
      revokePermission: vi.fn(() => Promise.resolve(undefined)),
      listRolePermissions: vi.fn(() => Promise.resolve([])),
      assignRole: vi.fn(() => Promise.resolve({
        id: 'binding_1',
        tenantId: null,
        subjectType: 'user',
        subjectId: 'user_1',
        roleId: 'role_1',
      })),
      revokeRole: vi.fn(() => Promise.resolve(undefined)),
      listBindings: vi.fn(() => Promise.resolve([])),
      listEffectiveRoles: vi.fn(() => Promise.resolve([])),
      listEffectivePermissions: vi.fn(() => Promise.resolve([])),
    } satisfies RbacStorage;
    const writeService = new RbacService({ storage: writeStorage });

    const invalidWrites = [
      () => writeService.createRole({ tenantId: ' ', key: 'role', permissions: [] }),
      () => writeService.createRole({ tenantId: null, key: ' ', permissions: [] }),
      () => writeService.createRole({ tenantId: null, key: 'role', permissions: ['bad permission'] }),
      () => writeService.updateRole({ roleId: ' ', key: 'role' }),
      () => writeService.deleteRole({ roleId: ' ' }),
      () => writeService.grantPermission({ roleId: ' ', permission: 'reports.read' }),
      () => writeService.grantPermission({ roleId: 'role_1', permission: 'reports..read' }),
      () => writeService.revokePermission({ roleId: ' ', permission: 'reports.read' }),
      () =>
        writeService.assignRole({
          tenantId: ' ',
          subject: user('user_1', tenantId),
          roleId: 'role_1',
        }),
      () =>
        writeService.assignRole({
          tenantId: null,
          subject: user('', tenantId),
          roleId: 'role_1',
        }),
      () =>
        writeService.assignRole({
          tenantId: null,
          subject: user('user_1'),
          roleId: ' ',
        }),
      () =>
        writeService.assignRole({
          tenantId: null,
          subject: user('user_1'),
          roleKey: ' ',
        }),
      () =>
        writeService.assignRole({
          tenantId: null,
          subject: user('user_1'),
          roleId: 'role_1',
          resource: { type: ' ', id: 'project_1' },
        }),
      () => writeService.revokeRole({ bindingId: ' ' }),
    ];

    for (const invalidWrite of invalidWrites) {
      await expect(invalidWrite()).rejects.toThrow();
    }

    expect(writeStorage.upsertRole).not.toHaveBeenCalled();
    expect(writeStorage.deleteRole).not.toHaveBeenCalled();
    expect(writeStorage.grantPermission).not.toHaveBeenCalled();
    expect(writeStorage.revokePermission).not.toHaveBeenCalled();
    expect(writeStorage.findRole).not.toHaveBeenCalled();
    expect(writeStorage.assignRole).not.toHaveBeenCalled();
    expect(writeStorage.revokeRole).not.toHaveBeenCalled();
  });

  it('allows global roles and permissions inside tenants only when configured', async () => {
    const globalStorage = new InMemoryRbacStorage();
    const globalRole = await globalStorage.upsertRole({
      tenantId: null,
      key: 'global_admin',
      permissions: ['system.read'],
    });
    await globalStorage.assignRole({
      tenantId: null,
      subject: user('user_global', tenantId),
      roleId: globalRole.id,
    });

    const denyService = new RbacService({ storage: globalStorage });
    await expect(
      denyService.can({
        subject: user('user_global', tenantId),
        tenantId,
        permission: 'system.read',
      }),
    ).resolves.toMatchObject({ allowed: false });
    await expect(
      denyService.can({
        subject: user('user_global', tenantId),
        tenantId,
        roleKey: 'global_admin',
      }),
    ).resolves.toMatchObject({ allowed: false });

    const allowService = new RbacService({
      storage: globalStorage,
      tenant: { allowGlobalRolesInTenant: true },
    });
    await expect(
      allowService.can({
        subject: user('user_global', tenantId),
        tenantId,
        permission: 'system.read',
      }),
    ).resolves.toMatchObject({
      allowed: true,
      matchedRoleKeys: ['global_admin'],
      matchedPermissions: ['system.read'],
    });
    await expect(
      allowService.can({
        subject: user('user_global', tenantId),
        tenantId,
        roleKey: 'global_admin',
      }),
    ).resolves.toMatchObject({
      allowed: true,
      matchedRoleKeys: ['global_admin'],
    });
  });

  it('logs write operation audit events without sensitive subject attributes or binding metadata', async () => {
    const log = vi.fn<(event: RbacAuditEvent) => void>();
    const auditService = new RbacService({
      storage: new InMemoryRbacStorage(),
      auditLogger: { log },
    });
    const role = await auditService.createRole({
      tenantId,
      key: 'auditor',
      permissions: ['reports.read', 'secrets.read'],
    });
    await auditService.updateRole({
      roleId: role.id,
      tenantId,
      name: 'Auditor',
    });
    await auditService.grantPermission({
      roleId: role.id,
      permission: 'reports.export',
    });
    await auditService.revokePermission({
      roleId: role.id,
      permission: 'reports.export',
    });
    const resourceWithSecret = {
      type: project.type,
      id: project.id,
      secret: 'resource-secret',
    } as RbacResourceRef;
    const binding = await auditService.assignRole({
      tenantId,
      subject: {
        type: 'user',
        id: 'user_audit',
        attributes: { email: 'private@example.com' },
      },
      roleId: role.id,
      resource: resourceWithSecret,
      metadata: { internalNote: 'binding-secret' },
    });
    await auditService.revokeRole({
      bindingId: binding.id,
      revokedAt: now,
    });
    await auditService.deleteRole({ roleId: role.id });

    const events = log.mock.calls.map(([event]) => event);
    expect(events.map((event) => event.type)).toEqual([
      'rbac.role.created',
      'rbac.role.updated',
      'rbac.permission.granted',
      'rbac.permission.revoked',
      'rbac.role.assigned',
      'rbac.role.revoked',
      'rbac.role.deleted',
    ]);
    const createdEvent = events.find((event) => event.type === 'rbac.role.created');
    expect(createdEvent).toMatchObject({ tenantId });
    expect(createdEvent?.metadata).toMatchObject({ roleId: role.id, roleKey: 'auditor' });

    const assignedEvent = events.find((event) => event.type === 'rbac.role.assigned');
    expect(assignedEvent).toMatchObject({
      tenantId,
      subjectType: 'user',
      subjectId: 'user_audit',
    });
    expect(assignedEvent?.metadata).toMatchObject({
      bindingId: binding.id,
      roleId: role.id,
      resource: project,
    });

    const grantedEvent = events.find((event) => event.type === 'rbac.permission.granted');
    expect(grantedEvent?.metadata).toMatchObject({
      roleId: role.id,
      permission: 'reports.export',
    });
    expect(JSON.stringify(events)).not.toContain('private@example.com');
    expect(JSON.stringify(events)).not.toContain('binding-secret');
    expect(JSON.stringify(events)).not.toContain('resource-secret');
    expect(JSON.stringify(events)).not.toContain('secrets.read');
  });

  it('does not fail writes when audit logging fails', async () => {
    const auditService = new RbacService({
      storage: new InMemoryRbacStorage(),
      auditLogger: { log: vi.fn(() => Promise.reject(new Error('audit unavailable'))) },
    });
    const role = await auditService.createRole({
      tenantId,
      key: 'audit_failure_writer',
      permissions: [],
    });
    const resource = {
      type: 'project',
      id: 'project_1',
      secret: 'resource-secret',
    } as RbacResourceRef;
    const binding = await auditService.assignRole({
      tenantId,
      subject: user('user_audit_failure', tenantId),
      roleId: role.id,
      resource,
    });

    expect(binding).toMatchObject({
      roleId: role.id,
      resourceType: 'project',
      resourceId: 'project_1',
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
