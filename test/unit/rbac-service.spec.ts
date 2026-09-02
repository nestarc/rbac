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
  type RbacEffectivePermission,
  type RbacEffectiveRole,
  type RbacModuleOptions,
  type RbacResourceRef,
  type RbacStorage,
} from '../../src';
import { user } from '../fixtures/subjects';

const tenantId = 'tenant_1';
const project: RbacResourceRef = { type: 'project', id: 'project_1' };
const now = new Date('2026-01-15T00:00:00.000Z');

function effectiveResultStorage(input: {
  roles?: RbacEffectiveRole[];
  permissions?: RbacEffectivePermission[];
}) {
  const listEffectiveRoles = vi.fn<RbacStorage['listEffectiveRoles']>(() =>
    Promise.resolve(input.roles ?? []),
  );
  const listEffectivePermissions = vi.fn<RbacStorage['listEffectivePermissions']>(() =>
    Promise.resolve(input.permissions ?? []),
  );
  const storage = { listEffectiveRoles, listEffectivePermissions } as unknown as RbacStorage;

  return { storage, listEffectiveRoles, listEffectivePermissions };
}

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

  it('does not share permissions between subject types with the same id', async () => {
    await createAssignedRole('report_admin', ['reports.read']);

    await expect(
      service.can({
        subject: { type: 'service_account', id: 'user_1', tenantId },
        tenantId,
        permission: 'reports.read',
        resource: project,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_no_matching_permission',
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
      reason: 'denied_tenant_conflict',
      tenantId: 'tenant_2',
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

  it('does not scan every role when strict assignment resolves a role id', async () => {
    const strictService = new RbacService({
      storage,
      writeValidation: { rejectTenantMismatch: true },
    });
    const role = await strictService.createRole({
      tenantId,
      key: 'indexed_tenant_viewer',
      permissions: ['reports.read'],
    });
    const listRoles = vi.spyOn(storage, 'listRoles');

    await expect(
      strictService.assignRole({
        tenantId,
        subject: user('indexed_user', tenantId),
        roleId: role.id,
      }),
    ).resolves.toMatchObject({ roleId: role.id });

    expect(listRoles).not.toHaveBeenCalled();
  });

  it("uses a custom adapter's optional indexed role lookup for strict assignment", async () => {
    const customStorage = new InMemoryRbacStorage();
    const role = await customStorage.upsertRole({
      tenantId,
      key: 'custom_indexed_tenant_viewer',
      permissions: ['reports.read'],
    });
    const findRoleById = vi.fn(customStorage.findRoleById.bind(customStorage));
    const listRoles = vi.spyOn(customStorage, 'listRoles');
    const adapter = Object.create(customStorage) as RbacStorage;
    Object.defineProperty(adapter, 'findRoleById', {
      value: findRoleById,
    });
    const strictService = new RbacService({
      storage: adapter,
      writeValidation: { rejectTenantMismatch: true },
    });

    await expect(
      strictService.assignRole({
        tenantId,
        subject: user('custom_indexed_user', tenantId),
        roleId: role.id,
      }),
    ).resolves.toMatchObject({ roleId: role.id });

    expect(findRoleById).toHaveBeenCalledOnce();
    expect(findRoleById).toHaveBeenCalledWith({ roleId: role.id });
    expect(listRoles).not.toHaveBeenCalled();
  });

  it('keeps the deprecated full-list fallback for legacy custom adapters', async () => {
    const legacyStorage = new InMemoryRbacStorage();
    const role = await legacyStorage.upsertRole({
      tenantId,
      key: 'legacy_scan_tenant_viewer',
      permissions: ['reports.read'],
    });
    const listRoles = vi.spyOn(legacyStorage, 'listRoles');
    const adapter = Object.create(legacyStorage) as RbacStorage;
    Object.defineProperty(adapter, 'findRoleById', {
      value: undefined,
    });
    const strictService = new RbacService({
      storage: adapter,
      writeValidation: { rejectTenantMismatch: true },
    });

    await expect(
      strictService.assignRole({
        tenantId,
        subject: user('legacy_scan_user', tenantId),
        roleId: role.id,
      }),
    ).resolves.toMatchObject({ roleId: role.id });

    expect(listRoles).toHaveBeenCalledOnce();
    expect(listRoles).toHaveBeenCalledWith({});
  });

  it('rejects subject and binding tenant mismatches in strict role assignments', async () => {
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
        tenantId,
        subject: user('user_1', 'tenant_2'),
        roleId: role.id,
      }),
    ).rejects.toMatchObject({
      details: {
        reason: 'subject_tenant_mismatch',
        subjectTenantId: 'tenant_2',
        bindingTenantId: tenantId,
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

  it('emits one best-effort audit and change event only for committed built-in mutations', async () => {
    const publish = vi.fn<NonNullable<RbacModuleOptions['changePublisher']>['publish']>();
    const log = vi.fn<(event: RbacAuditEvent) => void>();
    const eventService = new RbacService({
      storage: new InMemoryRbacStorage(),
      now: () => now,
      auditLogger: { log },
      changePublisher: { publish },
    });

    const role = await eventService.createRole({
      tenantId,
      key: 'mutation_writer',
      permissions: ['reports.read'],
    });
    await eventService.createRole({
      tenantId,
      key: 'mutation_writer',
      permissions: ['reports.read'],
    });
    await eventService.createRole({
      tenantId,
      key: 'mutation_writer',
      name: 'Mutation writer',
      permissions: ['reports.read'],
    });

    await expect(
      eventService.updateRole({ roleId: 'missing_role', name: 'Missing role' }),
    ).rejects.toBeInstanceOf(RbacRoleNotFoundError);
    await eventService.updateRole({ roleId: role.id, name: 'Mutation writer' });

    const binding = await eventService.assignRole({
      tenantId,
      subject: user('mutation_user', tenantId),
      roleId: role.id,
    });
    await eventService.assignRole({
      tenantId,
      subject: user('mutation_user', tenantId),
      roleId: role.id,
    });

    await eventService.grantPermission({ roleId: role.id, permission: 'reports.read' });
    await eventService.grantPermission({ roleId: role.id, permission: 'reports.export' });
    await eventService.grantPermission({ roleId: role.id, permission: 'reports.export' });
    await eventService.revokePermission({ roleId: role.id, permission: 'reports.missing' });
    await eventService.revokePermission({ roleId: role.id, permission: 'reports.export' });
    await eventService.revokePermission({ roleId: role.id, permission: 'reports.export' });

    await eventService.revokeRole({ bindingId: 'missing_binding', revokedAt: now });
    await eventService.revokeRole({ bindingId: binding.id, revokedAt: now });
    await eventService.revokeRole({ bindingId: binding.id, revokedAt: now });

    await eventService.deleteRole({ roleId: 'missing_role' });
    await eventService.deleteRole({ roleId: role.id });
    await eventService.deleteRole({ roleId: role.id });

    expect(log.mock.calls.map(([event]) => event.type)).toEqual([
      'rbac.role.created',
      'rbac.role.updated',
      'rbac.role.assigned',
      'rbac.permission.granted',
      'rbac.permission.revoked',
      'rbac.role.revoked',
      'rbac.role.deleted',
    ]);
    expect(publish.mock.calls.map(([event]) => event.type)).toEqual([
      'role.created',
      'role.updated',
      'role.assigned',
      'permission.granted',
      'permission.revoked',
      'role.revoked',
      'role.deleted',
    ]);
  });

  it('preserves the deprecated best-effort event fallback for result-less custom storage', async () => {
    const legacyStorage = new InMemoryRbacStorage();
    Object.defineProperty(legacyStorage, 'mutationResults', { value: undefined });
    const publish = vi.fn<NonNullable<RbacModuleOptions['changePublisher']>['publish']>();
    const legacyService = new RbacService({ storage: legacyStorage, changePublisher: { publish } });
    const input = { tenantId, key: 'legacy_writer', permissions: [] };

    await legacyService.createRole(input);
    await legacyService.createRole(input);

    expect(publish.mock.calls.map(([event]) => event.type)).toEqual([
      'role.created',
      'role.created',
    ]);
  });

  it('uses canonical identifiers for create, assign, can, audit, and change events', async () => {
    const publish = vi.fn<NonNullable<RbacModuleOptions['changePublisher']>['publish']>();
    const log = vi.fn<(event: RbacAuditEvent) => void>();
    const canonicalService = new RbacService({
      storage: new InMemoryRbacStorage(),
      now: () => now,
      auditLogger: { log },
      changePublisher: { publish },
    });
    const role = await canonicalService.createRole({
      tenantId: ' tenant_canonical ',
      key: ' report_reader ',
      permissions: [' reports.read '],
    });
    const binding = await canonicalService.assignRole({
      tenantId: ' tenant_canonical ',
      subject: {
        type: ' service_account ',
        id: ' worker_1 ',
        tenantId: ' tenant_canonical ',
      },
      roleKey: ' report_reader ',
      resource: { type: ' project ', id: ' project_1 ' },
    });
    const decision = await canonicalService.can({
      tenantId: ' tenant_canonical ',
      subject: {
        type: ' service_account ',
        id: ' worker_1 ',
        tenantId: ' tenant_canonical ',
      },
      permission: ' reports.read ',
      resource: { type: ' project ', id: ' project_1 ' },
      now,
    });

    expect(role).toMatchObject({
      tenantId: 'tenant_canonical',
      key: 'report_reader',
      permissions: ['reports.read'],
    });
    expect(binding).toMatchObject({
      tenantId: 'tenant_canonical',
      subjectType: 'service_account',
      subjectId: 'worker_1',
      resourceType: 'project',
      resourceId: 'project_1',
    });
    expect(decision).toMatchObject({
      allowed: true,
      tenantId: 'tenant_canonical',
      subject: {
        type: 'service_account',
        id: 'worker_1',
        tenantId: 'tenant_canonical',
      },
      permission: 'reports.read',
      permissions: ['reports.read'],
      resource: { type: 'project', id: 'project_1' },
    });
    const createdAudit = log.mock.calls[0]?.[0];
    const assignedAudit = log.mock.calls[1]?.[0];
    expect(createdAudit).toMatchObject({ tenantId: 'tenant_canonical' });
    expect(createdAudit?.metadata).toMatchObject({ roleKey: 'report_reader' });
    expect(assignedAudit).toMatchObject({
      tenantId: 'tenant_canonical',
      subjectType: 'service_account',
      subjectId: 'worker_1',
    });
    expect(assignedAudit?.metadata).toMatchObject({
      roleKey: 'report_reader',
      resource: { type: 'project', id: 'project_1' },
    });
    expect(publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tenantId: 'tenant_canonical',
        roleKey: 'report_reader',
        permissions: ['reports.read'],
      }),
    );
    expect(publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tenantId: 'tenant_canonical',
        subject: { type: 'service_account', id: 'worker_1' },
        roleKey: 'report_reader',
        resource: { type: 'project', id: 'project_1' },
      }),
    );
  });

  it('keeps API-key subject ids exact instead of repairing them with trim', async () => {
    const publish = vi.fn<NonNullable<RbacModuleOptions['changePublisher']>['publish']>();
    const exactService = new RbacService({
      storage: new InMemoryRbacStorage(),
      changePublisher: { publish },
    });
    const exactTenantId = ` ${tenantId} `;
    const role = await exactService.createRole({
      tenantId: exactTenantId,
      key: 'api_key_reader',
      permissions: ['api.read'],
    });
    const exactSubject = {
      type: 'api_key' as const,
      id: ' Key_\u212B ',
      tenantId: exactTenantId,
    };

    await exactService.assignRole({
      tenantId: exactTenantId,
      subject: exactSubject,
      roleId: role.id,
    });

    expect(publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'role.assigned',
        tenantId,
        subject: { type: 'api_key', id: exactSubject.id },
      }),
    );

    await expect(
      exactService.can({ tenantId: exactTenantId, subject: exactSubject, permission: 'api.read' }),
    ).resolves.toMatchObject({
      allowed: true,
      tenantId,
      subject: exactSubject,
    });
    await expect(
      exactService.can({
        tenantId: exactTenantId,
        subject: { ...exactSubject, id: exactSubject.id.trim() },
        permission: 'api.read',
      }),
    ).resolves.toMatchObject({ allowed: false });
  });

  it('canonicalizes update, permission, revoke, list, and delete identifiers', async () => {
    const publish = vi.fn<NonNullable<RbacModuleOptions['changePublisher']>['publish']>();
    const writeService = new RbacService({
      storage: new InMemoryRbacStorage(),
      changePublisher: { publish },
    });
    const role = await writeService.createRole({
      tenantId,
      key: 'writer',
      permissions: [],
    });
    const updated = await writeService.updateRole({
      roleId: ` ${role.id} `,
      key: ' canonical_writer ',
    });
    await writeService.grantPermission({
      roleId: ` ${role.id} `,
      permission: ' reports.write ',
    });
    const binding = await writeService.assignRole({
      tenantId,
      subject: user('writer_1', tenantId),
      roleId: ` ${role.id} `,
    });

    expect(updated).toMatchObject({ id: role.id, key: 'canonical_writer' });
    await expect(writeService.listPermissions({ roleId: ` ${role.id} ` })).resolves.toEqual([
      'reports.write',
    ]);
    await expect(writeService.listRoles({ tenantId: ` ${tenantId} ` })).resolves.toEqual([
      expect.objectContaining({ id: role.id, key: 'canonical_writer' }),
    ]);
    await expect(
      writeService.listBindings({
        tenantId: ` ${tenantId} `,
        subject: { type: ' user ', id: ' writer_1 ', tenantId: ` ${tenantId} ` },
      }),
    ).resolves.toEqual([expect.objectContaining({ id: binding.id, roleId: role.id })]);

    await writeService.revokePermission({
      roleId: ` ${role.id} `,
      permission: ' reports.write ',
    });
    await writeService.revokeRole({ bindingId: ` ${binding.id} ` });
    await writeService.deleteRole({ roleId: ` ${role.id} ` });

    expect(publish.mock.calls.map(([event]) => event)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'role.updated',
          roleId: role.id,
          roleKey: 'canonical_writer',
        }),
        expect.objectContaining({
          type: 'permission.granted',
          roleId: role.id,
          permissions: ['reports.write'],
        }),
        expect.objectContaining({
          type: 'permission.revoked',
          roleId: role.id,
          permissions: ['reports.write'],
        }),
        expect.objectContaining({ type: 'role.revoked', bindingId: binding.id }),
        expect.objectContaining({ type: 'role.deleted', roleId: role.id }),
      ]),
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
      assignRole: vi.fn(() =>
        Promise.resolve({
          id: 'binding_1',
          tenantId: null,
          subjectType: 'user',
          subjectId: 'user_1',
          roleId: 'role_1',
        }),
      ),
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

  it('rejects an invalid runtime permission mode instead of relaxing it to any', async () => {
    await createAssignedRole('runtime_reader', ['reports.read']);
    const decision = service.can({
      subject: user('user_1', tenantId),
      tenantId,
      permissions: ['reports.read', 'reports.write'],
      mode: 'some',
      resource: project,
      now,
    } as unknown as RbacCanInput);

    await expect(decision).rejects.toBeInstanceOf(RbacConfigError);
    await expect(decision).rejects.toMatchObject({
      details: { operation: 'can', field: 'mode' },
    });
  });

  it('rejects an invalid runtime tenant mode instead of relaxing it to optional', async () => {
    const globalRole = await service.createRole({
      tenantId: null,
      key: 'runtime_global_reader',
      permissions: ['system.read'],
    });
    await service.assignRole({
      tenantId: null,
      subject: user('runtime_global_user'),
      roleId: globalRole.id,
    });
    const decision = service.can({
      subject: user('runtime_global_user'),
      permission: 'system.read',
      tenantMode: 'sometimes',
      now,
    } as unknown as RbacCanInput);

    await expect(decision).rejects.toBeInstanceOf(RbacConfigError);
    await expect(decision).rejects.toMatchObject({
      details: { operation: 'can', field: 'tenantMode' },
    });
  });

  it.each([
    ['non-object input', null, 'input'],
    ['missing requirement family', { subject: user('user_1', tenantId) }, 'requirement'],
    [
      'non-string tenant id',
      { subject: user('user_1', tenantId), tenantId: 42, permission: 'reports.read' },
      'tenantId',
    ],
    [
      'non-string permission',
      { subject: user('user_1', tenantId), tenantId, permission: 42 },
      'permission',
    ],
    [
      'malformed permission array',
      { subject: user('user_1', tenantId), tenantId, permissions: ['reports.read', null] },
      'permissions',
    ],
    [
      'mode on a role requirement',
      { subject: user('user_1', tenantId), tenantId, roleKey: 'owner', mode: 'any' },
      'mode',
    ],
  ])('rejects a %s runtime requirement shape', async (_label, input, field) => {
    await expect(service.can(input as unknown as RbacCanInput)).rejects.toMatchObject({
      code: 'RBAC_CONFIG_ERROR',
      details: { operation: 'can', field },
    });
  });

  it.each([
    ['invalid Date', new Date('invalid')],
    ['non-Date value', '2026-01-15T00:00:00.000Z'],
  ])('rejects an invalid runtime now %s before reading storage', async (_label, invalidNow) => {
    const listEffectivePermissions = vi.spyOn(storage, 'listEffectivePermissions');

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permission: 'reports.read',
        now: invalidNow,
      } as unknown as RbacCanInput),
    ).rejects.toMatchObject({
      code: 'RBAC_CONFIG_ERROR',
      details: { operation: 'can', field: 'now' },
    });
    expect(listEffectivePermissions).not.toHaveBeenCalled();
  });

  it('rejects an invalid configured clock result before reading storage', async () => {
    const listEffectivePermissions = vi.spyOn(storage, 'listEffectivePermissions');
    const clockService = new RbacService({
      storage,
      now: () => new Date('invalid'),
    });

    await expect(
      clockService.can({
        subject: user('user_1'),
        permission: 'reports.read',
      }),
    ).rejects.toMatchObject({
      code: 'RBAC_CONFIG_ERROR',
      details: { operation: 'can', field: 'now' },
    });
    expect(listEffectivePermissions).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['array', []],
    ['empty type', { type: ' ', id: 'user_1' }],
    ['empty id', { type: 'user', id: '' }],
    ['invalid tenant id', { type: 'user', id: 'user_1', tenantId: 42 }],
  ])('rejects an explicitly malformed %s subject', async (_label, invalidSubject) => {
    await expect(
      service.can({
        subject: invalidSubject,
        tenantId,
        permission: 'reports.read',
      } as unknown as RbacCanInput),
    ).rejects.toMatchObject({
      code: 'RBAC_CONFIG_ERROR',
      details: { operation: 'can', field: 'subject' },
    });
  });

  it.each([
    ['null', null],
    ['array', []],
    ['empty type', { type: '', id: 'project_1' }],
    ['empty id', { type: 'project', id: ' ' }],
    ['non-string id', { type: 'project', id: 42 }],
  ])('rejects an explicitly malformed %s resource', async (_label, invalidResource) => {
    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId,
        permission: 'reports.read',
        resource: invalidResource,
      } as unknown as RbacCanInput),
    ).rejects.toMatchObject({
      code: 'RBAC_CONFIG_ERROR',
      details: { operation: 'can', field: 'resource' },
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

  it('denies direct checks when subject and explicit tenant ids conflict', async () => {
    const listEffectivePermissions = vi.spyOn(storage, 'listEffectivePermissions');

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId: 'tenant_2',
        permission: 'reports.read',
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_tenant_conflict',
      details: {
        evaluationPath: [{ code: 'tenant_conflict', outcome: 'deny' }],
        safeMessage: 'denied_tenant_conflict',
      },
    });
    expect(listEffectivePermissions).not.toHaveBeenCalled();
  });

  it('does not let tenantMode none bypass an explicit cross-tenant conflict', async () => {
    const listEffectivePermissions = vi.spyOn(storage, 'listEffectivePermissions');

    await expect(
      service.can({
        subject: user('user_1', tenantId),
        tenantId: 'tenant_2',
        tenantMode: 'none',
        permission: 'system.read',
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'denied_tenant_conflict',
      tenantId: null,
    });
    expect(listEffectivePermissions).not.toHaveBeenCalled();
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
      upsertRole: vi.fn(() =>
        Promise.resolve({
          id: 'role_1',
          key: 'role',
          tenantId: null,
          permissions: [],
        }),
      ),
      deleteRole: vi.fn(() => Promise.resolve(undefined)),
      grantPermission: vi.fn(() => Promise.resolve(undefined)),
      revokePermission: vi.fn(() => Promise.resolve(undefined)),
      listRolePermissions: vi.fn(() => Promise.resolve([])),
      assignRole: vi.fn(() =>
        Promise.resolve({
          id: 'binding_1',
          tenantId: null,
          subjectType: 'user',
          subjectId: 'user_1',
          roleId: 'role_1',
        }),
      ),
      revokeRole: vi.fn(() => Promise.resolve(undefined)),
      listBindings: vi.fn(() => Promise.resolve([])),
      listEffectiveRoles: vi.fn(() => Promise.resolve([])),
      listEffectivePermissions: vi.fn(() => Promise.resolve([])),
    } satisfies RbacStorage;
    const writeService = new RbacService({ storage: writeStorage });

    const invalidWrites = [
      () => writeService.createRole({ tenantId: ' ', key: 'role', permissions: [] }),
      () => writeService.createRole({ tenantId: null, key: ' ', permissions: [] }),
      () =>
        writeService.createRole({ tenantId: null, key: 'role', permissions: ['bad permission'] }),
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
      () =>
        writeService.assignRole({
          tenantId: null,
          subject: user('user_1'),
          roleId: 'role_1',
          expiresAt: new Date('invalid'),
        }),
      () => writeService.revokeRole({ bindingId: ' ' }),
      () => writeService.revokeRole({ bindingId: 'binding_1', revokedAt: new Date('invalid') }),
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

  describe('custom storage effective result validation', () => {
    const effectiveRole: RbacEffectiveRole = {
      roleKey: 'report_reader',
      roleId: 'role_1',
      bindingId: 'binding_1',
      tenantId,
      resourceType: null,
      resourceId: null,
      expiresAt: null,
    };
    const effectivePermission: RbacEffectivePermission = {
      ...effectiveRole,
      permission: 'reports.read',
    };

    async function evaluate(
      kind: 'role' | 'permission',
      record: RbacEffectiveRole | RbacEffectivePermission,
      options: Pick<RbacModuleOptions, 'tenant'> = {},
      tenant: string | null = tenantId,
    ) {
      const { storage: customStorage } = effectiveResultStorage(
        kind === 'role'
          ? { roles: [record] }
          : { permissions: [record as RbacEffectivePermission] },
      );
      const customService = new RbacService({ storage: customStorage, ...options });
      const decision = await customService.can({
        subject: user('custom_storage_user', tenant ?? undefined),
        tenantId: tenant,
        ...(kind === 'role' ? { roleKey: 'report_reader' } : { permission: 'reports.read' }),
        resource: project,
        now,
      });

      return { customStorage, decision };
    }

    it.each([
      ['role', effectiveRole],
      ['permission', effectivePermission],
    ] as const)('denies wrong-tenant %s records', async (kind, record) => {
      const { decision } = await evaluate(kind, { ...record, tenantId: 'tenant_2' });

      expect(decision).toMatchObject({
        allowed: false,
        reason: kind === 'role' ? 'denied_no_matching_role' : 'denied_no_matching_permission',
      });
    });

    it.each([
      ['role', effectiveRole],
      ['permission', effectivePermission],
    ] as const)('denies expired and invalid-Date %s records', async (kind, record) => {
      const expired = await evaluate(kind, {
        ...record,
        expiresAt: new Date(now.getTime() - 1),
      });
      const invalid = await evaluate(kind, { ...record, expiresAt: new Date('invalid') });
      const nonDate = await evaluate(kind, {
        ...record,
        expiresAt: now.toISOString() as unknown as Date,
      });

      const expectedReason =
        kind === 'role' ? 'denied_no_matching_role' : 'denied_no_matching_permission';
      expect(expired.decision).toMatchObject({ allowed: false, reason: expectedReason });
      expect(invalid.decision).toMatchObject({ allowed: false, reason: expectedReason });
      expect(nonDate.decision).toMatchObject({ allowed: false, reason: expectedReason });
    });

    it.each([
      ['role', effectiveRole],
      ['permission', effectivePermission],
    ] as const)('keeps %s records expiring exactly at now active', async (kind, record) => {
      const { decision } = await evaluate(kind, { ...record, expiresAt: new Date(now) });

      expect(decision).toMatchObject({ allowed: true });
    });

    it.each([
      ['role', effectiveRole],
      ['permission', effectivePermission],
    ] as const)('denies malformed resource pairs on %s records', async (kind, record) => {
      const missingId = await evaluate(kind, {
        ...record,
        resourceType: project.type,
        resourceId: null,
      });
      const missingType = await evaluate(kind, {
        ...record,
        resourceType: null,
        resourceId: project.id,
      });
      const invalidType = await evaluate(kind, {
        ...record,
        resourceType: 42 as unknown as string,
        resourceId: project.id,
      });

      expect(missingId.decision).toMatchObject({ allowed: false });
      expect(missingType.decision).toMatchObject({ allowed: false });
      expect(invalidType.decision).toMatchObject({ allowed: false });
    });

    it.each([
      ['role', effectiveRole],
      ['permission', effectivePermission],
    ] as const)('does not let resource aliases override %s record scope', async (kind, record) => {
      const aliasedRecord = {
        ...record,
        resourceType: project.type,
        resourceId: 'project_2',
        type: project.type,
        id: project.id,
      };

      const { decision } = await evaluate(kind, aliasedRecord);

      expect(decision).toMatchObject({ allowed: false });
    });

    it.each([null, undefined] as const)(
      'treats tenantId %s as a global effective record only for global queries',
      async (recordTenantId) => {
        const globalRecord = { ...effectivePermission, tenantId: recordTenantId };
        const tenantDecision = await evaluate('permission', globalRecord);
        const globalDecision = await evaluate('permission', globalRecord, {}, null);

        expect(tenantDecision.decision).toMatchObject({ allowed: false });
        expect(globalDecision.decision).toMatchObject({ allowed: true });
      },
    );

    it.each([
      ['role', effectiveRole],
      ['permission', effectivePermission],
    ] as const)(
      'loads global %s records through the explicit tenant option and validates each query scope',
      async (kind, record) => {
        const globalRecord = { ...record, tenantId: null };
        const {
          storage: customStorage,
          listEffectiveRoles,
          listEffectivePermissions,
        } = effectiveResultStorage({});
        if (kind === 'role') {
          listEffectiveRoles.mockImplementation((input) =>
            Promise.resolve(input.tenantId === null ? [globalRecord] : []),
          );
        } else {
          listEffectivePermissions.mockImplementation((input) =>
            Promise.resolve(
              input.tenantId === null ? [globalRecord as RbacEffectivePermission] : [],
            ),
          );
        }
        const customService = new RbacService({
          storage: customStorage,
          tenant: { allowGlobalRolesInTenant: true },
        });

        const decision = await customService.can({
          subject: user('custom_storage_user', tenantId),
          tenantId,
          ...(kind === 'role' ? { roleKey: 'report_reader' } : { permission: 'reports.read' }),
          now,
        });

        expect(decision).toMatchObject({ allowed: true });
        if (kind === 'role') {
          expect(listEffectiveRoles).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ tenantId }),
          );
          expect(listEffectiveRoles).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ tenantId: null }),
          );
        } else {
          expect(listEffectivePermissions).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ tenantId }),
          );
          expect(listEffectivePermissions).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ tenantId: null }),
          );
        }
      },
    );

    it.each([
      ['role', effectiveRole],
      ['permission', effectivePermission],
    ] as const)('denies tenant %s records returned by the global query', async (kind, record) => {
      const {
        storage: customStorage,
        listEffectiveRoles,
        listEffectivePermissions,
      } = effectiveResultStorage({});
      if (kind === 'role') {
        listEffectiveRoles.mockImplementation((input) =>
          Promise.resolve(input.tenantId === null ? [record] : []),
        );
      } else {
        listEffectivePermissions.mockImplementation((input) =>
          Promise.resolve(input.tenantId === null ? [record] : []),
        );
      }
      const customService = new RbacService({
        storage: customStorage,
        tenant: { allowGlobalRolesInTenant: true },
      });

      const decision = await customService.can({
        subject: user('custom_storage_user', tenantId),
        tenantId,
        ...(kind === 'role' ? { roleKey: 'report_reader' } : { permission: 'reports.read' }),
        now,
      });

      expect(decision).toMatchObject({ allowed: false });
    });

    it('keeps malformed effective permissions fail closed', async () => {
      const { storage: customStorage } = effectiveResultStorage({
        permissions: [effectivePermission, { ...effectivePermission, permission: 'reports..read' }],
      });
      const customService = new RbacService({ storage: customStorage });

      await expect(
        customService.can({
          subject: user('custom_storage_user', tenantId),
          tenantId,
          permission: 'reports.read',
          now,
        }),
      ).resolves.toMatchObject({ allowed: false, reason: 'denied_storage_error' });

      const throwingService = new RbacService({
        storage: customStorage,
        storageErrors: 'throw',
      });
      await expect(
        throwingService.can({
          subject: user('custom_storage_user', tenantId),
          tenantId,
          permission: 'reports.read',
          now,
        }),
      ).rejects.toBeInstanceOf(RbacStorageError);
    });

    it.each([
      { roleKey: ' report_reader ' },
      { roleId: ' role_1 ' },
      { bindingId: ' binding_1 ' },
      { tenantId: ` ${tenantId} ` },
      { resourceType: ' project ', resourceId: project.id },
      { resourceType: project.type, resourceId: ` ${project.id} ` },
    ])('denies non-canonical existing effective records: %o', async (override) => {
      const { decision } = await evaluate('permission', {
        ...effectivePermission,
        ...override,
      });

      expect(decision).toMatchObject({
        allowed: false,
        reason: 'denied_no_matching_permission',
      });
    });

    it('fails closed on non-canonical stored permissions', async () => {
      const { decision } = await evaluate('permission', {
        ...effectivePermission,
        permission: ' reports.read ',
      });

      expect(decision).toMatchObject({ allowed: false, reason: 'denied_storage_error' });
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
