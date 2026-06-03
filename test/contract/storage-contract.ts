import { beforeEach, describe, expect, it } from 'vitest';
import { user } from '../fixtures/subjects';
import type { RbacResourceRef, RbacRole, RbacStorage } from '../../src';

interface RbacStorageContractOptions {
  createStorage: () => RbacStorage;
}

const tenantId = 'tenant_1';
const projectA: RbacResourceRef = { type: 'project', id: 'project_a' };
const projectB: RbacResourceRef = { type: 'project', id: 'project_b' };

function permissionsOf(results: { permission: string }[]): string[] {
  return results.map((result) => result.permission).sort();
}

function roleKeysOf(results: { roleKey: string }[]): string[] {
  return results.map((result) => result.roleKey).sort();
}

export function runRbacStorageContract({ createStorage }: RbacStorageContractOptions): void {
  describe('RbacStorage contract', () => {
    let storage: RbacStorage;

    beforeEach(() => {
      storage = createStorage();
    });

    async function createRole(
      key: string,
      permissions: string[],
      roleTenantId: string | null = tenantId,
    ): Promise<RbacRole> {
      return storage.upsertRole({
        tenantId: roleTenantId,
        key,
        name: key,
        permissions,
      });
    }

    it('creates a role with permissions and lists effective permissions', async () => {
      const role = await createRole('report_admin', ['reports.read', 'reports.write']);

      await storage.assignRole({
        tenantId,
        subject: user('user_1', tenantId),
        roleId: role.id,
      });

      await expect(storage.listRolePermissions({ roleId: role.id })).resolves.toEqual([
        'reports.read',
        'reports.write',
      ]);
      await expect(
        storage.listEffectivePermissions({
          tenantId,
          subject: user('user_1', tenantId),
        }),
      ).resolves.toMatchObject([
        { permission: 'reports.read', roleId: role.id, roleKey: 'report_admin' },
        { permission: 'reports.write', roleId: role.id, roleKey: 'report_admin' },
      ]);
    });

    it('grants and revokes permissions idempotently', async () => {
      const role = await createRole('billing_admin', []);

      await storage.grantPermission({ roleId: role.id, permission: ' billing.read ' });
      await storage.grantPermission({ roleId: role.id, permission: 'billing.read' });

      await expect(storage.listRolePermissions({ roleId: role.id })).resolves.toEqual([
        'billing.read',
      ]);

      await storage.revokePermission({ roleId: role.id, permission: 'billing.read' });
      await storage.revokePermission({ roleId: role.id, permission: 'billing.read' });

      await expect(storage.listRolePermissions({ roleId: role.id })).resolves.toEqual([]);
    });

    it('assigns and revokes roles idempotently', async () => {
      const role = await createRole('support_agent', ['tickets.read']);
      const firstBinding = await storage.assignRole({
        tenantId,
        subject: user('user_2', tenantId),
        roleId: role.id,
      });
      const secondBinding = await storage.assignRole({
        tenantId,
        subject: user('user_2', tenantId),
        roleId: role.id,
      });

      expect(secondBinding.id).toBe(firstBinding.id);
      await expect(
        storage.listEffectiveRoles({ tenantId, subject: user('user_2', tenantId) }),
      ).resolves.toHaveLength(1);

      await storage.revokeRole({ bindingId: firstBinding.id, revokedAt: new Date('2026-01-01') });
      await storage.revokeRole({ bindingId: firstBinding.id, revokedAt: new Date('2026-02-01') });

      await expect(
        storage.listEffectiveRoles({ tenantId, subject: user('user_2', tenantId) }),
      ).resolves.toEqual([]);
    });

    it('excludes expired and revoked bindings from effective permissions', async () => {
      const now = new Date('2026-01-15T00:00:00.000Z');
      const role = await createRole('auditor', ['audit.read']);
      const revokedBinding = await storage.assignRole({
        tenantId,
        subject: user('user_3', tenantId),
        roleId: role.id,
      });

      await storage.assignRole({
        tenantId,
        subject: user('user_3', tenantId),
        roleId: role.id,
        resource: projectA,
        expiresAt: new Date('2026-01-14T00:00:00.000Z'),
      });
      await storage.revokeRole({ bindingId: revokedBinding.id, revokedAt: now });

      await expect(
        storage.listEffectivePermissions({
          tenantId,
          subject: user('user_3', tenantId),
          resource: projectA,
          now,
        }),
      ).resolves.toEqual([]);
    });

    it('filters roles and bindings by tenant', async () => {
      const tenantRole = await createRole('tenant_reader', ['tenant.read']);
      const otherRole = await createRole('other_reader', ['other.read'], 'tenant_2');

      await storage.assignRole({
        tenantId,
        subject: user('user_4', tenantId),
        roleId: tenantRole.id,
      });
      await storage.assignRole({
        tenantId: 'tenant_2',
        subject: user('user_4', 'tenant_2'),
        roleId: otherRole.id,
      });

      await expect(storage.listRoles({ tenantId })).resolves.toMatchObject([
        { key: 'tenant_reader' },
      ]);
      await expect(
        storage.listBindings({ tenantId, subject: user('user_4', tenantId) }),
      ).resolves.toMatchObject([{ tenantId, roleId: tenantRole.id }]);
      await expect(
        storage.listEffectivePermissions({ tenantId, subject: user('user_4', tenantId) }),
      ).resolves.toMatchObject([{ permission: 'tenant.read', roleId: tenantRole.id }]);
    });

    it('updates role metadata without deleting permissions when permissions are omitted', async () => {
      const role = await createRole('editor', ['documents.read', 'documents.write']);
      const updated = await storage.upsertRole({
        roleId: role.id,
        name: 'Document editor',
        description: 'Can edit documents',
      });

      expect(updated).toMatchObject({
        id: role.id,
        key: 'editor',
        name: 'Document editor',
        description: 'Can edit documents',
        permissions: ['documents.read', 'documents.write'],
      });
      await expect(storage.listRolePermissions({ roleId: role.id })).resolves.toEqual([
        'documents.read',
        'documents.write',
      ]);
    });

    it('applies resource-scoped bindings only to the matching resource', async () => {
      const role = await createRole('project_viewer', ['projects.read']);

      await storage.assignRole({
        tenantId,
        subject: user('user_5', tenantId),
        roleId: role.id,
        resource: projectA,
      });

      await expect(
        storage.listEffectivePermissions({ tenantId, subject: user('user_5', tenantId) }),
      ).resolves.toEqual([]);
      await expect(
        storage.listEffectivePermissions({
          tenantId,
          subject: user('user_5', tenantId),
          resource: projectB,
        }),
      ).resolves.toEqual([]);
      await expect(
        storage.listEffectivePermissions({
          tenantId,
          subject: user('user_5', tenantId),
          resource: projectA,
        }),
      ).resolves.toMatchObject([{ permission: 'projects.read', roleId: role.id }]);
    });

    it('applies tenant-wide unscoped bindings to requested resources', async () => {
      const role = await createRole('tenant_operator', ['projects.write']);

      await storage.assignRole({
        tenantId,
        subject: user('user_6', tenantId),
        roleId: role.id,
      });

      await expect(
        storage.listEffectivePermissions({
          tenantId,
          subject: user('user_6', tenantId),
          resource: projectA,
        }),
      ).resolves.toMatchObject([{ permission: 'projects.write', roleId: role.id }]);
    });

    it('does not apply global bindings when a tenant is requested', async () => {
      const role = await createRole('global_admin', ['system.manage'], null);

      await storage.assignRole({
        tenantId: null,
        subject: user('user_7'),
        roleId: role.id,
      });

      await expect(
        storage.listEffectivePermissions({ tenantId, subject: user('user_7') }),
      ).resolves.toEqual([]);
      await expect(
        storage.listEffectivePermissions({ tenantId: null, subject: user('user_7') }),
      ).resolves.toMatchObject([{ permission: 'system.manage', roleId: role.id }]);
    });

    it('stores wildcard permissions and lists them effectively', async () => {
      const role = await createRole('wildcard_admin', ['*']);

      await storage.assignRole({
        tenantId,
        subject: user('user_8', tenantId),
        roleId: role.id,
      });

      await expect(storage.listRolePermissions({ roleId: role.id })).resolves.toEqual(['*']);
      await expect(
        storage.listEffectivePermissions({ tenantId, subject: user('user_8', tenantId) }),
      ).resolves.toMatchObject([{ permission: '*', roleId: role.id }]);
    });

    it('lists effective roles even when matching roles have no permissions', async () => {
      const role = await createRole('empty_role', []);

      await storage.assignRole({
        tenantId,
        subject: user('user_9', tenantId),
        roleId: role.id,
      });

      await expect(
        storage.listEffectiveRoles({ tenantId, subject: user('user_9', tenantId) }),
      ).resolves.toMatchObject([{ roleKey: 'empty_role', roleId: role.id }]);
      await expect(
        storage.listEffectivePermissions({ tenantId, subject: user('user_9', tenantId) }),
      ).resolves.toEqual([]);
    });

    it('excludes expired and revoked roles from effective roles', async () => {
      const now = new Date('2026-01-15T00:00:00.000Z');
      const expiredRole = await createRole('expired_role', []);
      const revokedRole = await createRole('revoked_role', []);
      const revokedBinding = await storage.assignRole({
        tenantId,
        subject: user('user_10', tenantId),
        roleId: revokedRole.id,
      });

      await storage.assignRole({
        tenantId,
        subject: user('user_10', tenantId),
        roleId: expiredRole.id,
        expiresAt: new Date('2026-01-14T00:00:00.000Z'),
      });
      await storage.revokeRole({ bindingId: revokedBinding.id, revokedAt: now });

      await expect(
        storage.listEffectiveRoles({ tenantId, subject: user('user_10', tenantId), now }),
      ).resolves.toEqual([]);
    });

    it('excludes bindings whose roles no longer exist', async () => {
      const role = await createRole('temporary_role', ['temporary.read']);

      await storage.assignRole({
        tenantId,
        subject: user('user_11', tenantId),
        roleId: role.id,
      });
      await storage.deleteRole({ roleId: role.id });

      await expect(
        storage.listEffectiveRoles({ tenantId, subject: user('user_11', tenantId) }),
      ).resolves.toEqual([]);
      await expect(
        storage.listEffectivePermissions({ tenantId, subject: user('user_11', tenantId) }),
      ).resolves.toEqual([]);
    });

    it('returns normalized permission sets from effective bindings', async () => {
      const role = await createRole('normalizer', [' reports.read ', 'reports.read', 'reports.*']);

      await storage.assignRole({
        tenantId,
        subject: user('user_12', tenantId),
        roleId: role.id,
      });

      const effectivePermissions = await storage.listEffectivePermissions({
        tenantId,
        subject: user('user_12', tenantId),
      });

      expect(permissionsOf(effectivePermissions)).toEqual(['reports.*', 'reports.read']);
    });

    it('returns effective roles from unscoped and matching scoped bindings', async () => {
      const unscopedRole = await createRole('unscoped_role', []);
      const scopedRole = await createRole('scoped_role', []);

      await storage.assignRole({
        tenantId,
        subject: user('user_13', tenantId),
        roleId: unscopedRole.id,
      });
      await storage.assignRole({
        tenantId,
        subject: user('user_13', tenantId),
        roleId: scopedRole.id,
        resource: projectA,
      });

      const rolesWithoutResource = await storage.listEffectiveRoles({
        tenantId,
        subject: user('user_13', tenantId),
      });
      const rolesWithResource = await storage.listEffectiveRoles({
        tenantId,
        subject: user('user_13', tenantId),
        resource: projectA,
      });

      expect(roleKeysOf(rolesWithoutResource)).toEqual(['unscoped_role']);
      expect(roleKeysOf(rolesWithResource)).toEqual(['scoped_role', 'unscoped_role']);
    });
  });
}
