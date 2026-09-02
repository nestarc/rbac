import { isDeepStrictEqual } from 'node:util';
import { RbacConfigError } from '../errors';
import { normalizePermission, normalizePermissions } from '../utils';
import { canonicalizeIdentifier, canonicalizeSubject } from '../utils/canonicalization';
import type {
  AssignRoleStorageInput,
  CreateRoleInput,
  DeleteRoleInput,
  FindRoleByIdInput,
  FindRoleInput,
  GrantPermissionInput,
  ListBindingsStorageInput,
  ListEffectivePermissionsInput,
  ListEffectiveRolesInput,
  ListRolePermissionsInput,
  ListRolesInput,
  RbacEffectivePermission,
  RbacEffectiveRole,
  RbacRole,
  RbacRoleBinding,
  RbacStorage,
  RbacMutationResult,
  RbacStorageMutationCapability,
  RbacStorageRoleLookupCapability,
  RevokePermissionInput,
  RevokeRoleStorageInput,
  UpdateRoleInput,
  UpsertRoleInput,
} from '../interfaces';
import {
  cloneDate,
  encodeMetadata,
  toBinding,
  toEffectiveRole,
  toRole,
  type PrismaBindingRecord,
  type PrismaEffectiveBindingRecord,
  type PrismaRoleRecord,
} from './prisma-rbac.mapper';
import {
  isActiveBinding,
  isPrismaUniqueConstraintError,
  mutationCount,
  newPrismaRbacId,
  sameDate,
} from './prisma-rbac-mutation';
import {
  canonicalizeAssignInput,
  canonicalizeUpsertRoleInput,
  effectiveBindingWhere,
  normalizeTenantId,
  roleInputChangesRecord,
  roleWhere,
} from './prisma-rbac.query';

type PrismaDelegate = {
  findFirst(args?: Record<string, unknown>): Promise<unknown>;
  findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  create(args: Record<string, unknown>): Promise<unknown>;
  update(args: Record<string, unknown>): Promise<unknown>;
  updateMany?(args: Record<string, unknown>): Promise<unknown>;
  upsert(args: Record<string, unknown>): Promise<unknown>;
  delete(args: Record<string, unknown>): Promise<unknown>;
  deleteMany(args?: Record<string, unknown>): Promise<unknown>;
};

export interface PrismaRbacTransactionClientLike {
  rbacRole: PrismaDelegate;
  rbacPermission: PrismaDelegate;
  rbacRolePermission: PrismaDelegate;
  rbacRoleBinding: PrismaDelegate;
}

export interface PrismaRbacClientLike extends PrismaRbacTransactionClientLike {
  $transaction<T>(fn: (tx: PrismaRbacTransactionClientLike) => Promise<T>): Promise<T>;
}

export class PrismaRbacStorage implements RbacStorage, RbacStorageRoleLookupCapability {
  constructor(private readonly prisma: PrismaRbacClientLike) {}

  readonly mutationResults: RbacStorageMutationCapability = {
    createRole: (input: CreateRoleInput) =>
      this.upsertRoleWithRetry(canonicalizeUpsertRoleInput(input), false, true),
    updateRole: (input: UpdateRoleInput) =>
      this.upsertRoleWithRetry(canonicalizeUpsertRoleInput(input), false, false),
    deleteRole: (input: DeleteRoleInput) => this.deleteRoleWithResult(input),
    grantPermission: (input: GrantPermissionInput) => this.grantPermissionWithResult(input, false),
    revokePermission: (input: RevokePermissionInput) => this.revokePermissionWithResult(input),
    assignRole: (input: AssignRoleStorageInput) =>
      this.assignRoleWithRetry(canonicalizeAssignInput(input), false),
    revokeRole: (input: RevokeRoleStorageInput) => this.revokeRoleWithResult(input),
  };

  async findRole(input: FindRoleInput): Promise<RbacRole | null> {
    const key = canonicalizeIdentifier(input.key, 'role key');
    const role = (await this.prisma.rbacRole.findFirst({
      where: roleWhere(normalizeTenantId(input.tenantId), key),
      include: { permissions: { include: { permission: true } } },
    })) as PrismaRoleRecord | null;

    return role ? toRole(role) : null;
  }

  async findRoleById(input: FindRoleByIdInput): Promise<RbacRole | null> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const role = (await this.prisma.rbacRole.findFirst({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    })) as PrismaRoleRecord | null;

    return role ? toRole(role) : null;
  }

  async listRoles(input: ListRolesInput): Promise<RbacRole[]> {
    const roles = (await this.prisma.rbacRole.findMany({
      where:
        input.tenantId === undefined ? undefined : { tenantId: normalizeTenantId(input.tenantId) },
      include: { permissions: { include: { permission: true } } },
      orderBy: [{ tenantId: 'asc' }, { key: 'asc' }],
    })) as PrismaRoleRecord[];

    return roles.map(toRole);
  }

  async upsertRole(input: UpsertRoleInput): Promise<RbacRole> {
    const result = await this.upsertRoleWithRetry(canonicalizeUpsertRoleInput(input), false, true);
    if (result.value) return result.value;

    throw new RbacConfigError({
      operation: 'upsertRole',
      reason: result.reason ?? 'mutation_result_missing_value',
    });
  }

  private async upsertRoleWithRetry(
    input: UpsertRoleInput,
    retried: boolean,
    allowMissingExplicitRole: boolean,
  ): Promise<RbacMutationResult<RbacRole>> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const hasExplicitRoleId = 'roleId' in input;
        const explicitRoleId = hasExplicitRoleId ? input.roleId : undefined;
        let existing: PrismaRoleRecord | null;

        if (hasExplicitRoleId) {
          existing = (await tx.rbacRole.findFirst({
            where: { id: explicitRoleId },
            include: { permissions: { include: { permission: true } } },
          })) as PrismaRoleRecord | null;
        } else {
          existing = (await tx.rbacRole.findFirst({
            where: roleWhere(normalizeTenantId(input.tenantId), input.key),
            include: { permissions: { include: { permission: true } } },
          })) as PrismaRoleRecord | null;
        }

        if (hasExplicitRoleId && !existing && !allowMissingExplicitRole) {
          return { outcome: 'conflict', reason: 'role_not_found' };
        }

        if (existing && !roleInputChangesRecord(existing, input)) {
          return { outcome: 'no-op', value: toRole(existing) };
        }

        const id = existing?.id ?? explicitRoleId ?? newPrismaRbacId('role');
        const key = input.key ?? existing?.key ?? id;
        const tenantId =
          input.tenantId !== undefined
            ? normalizeTenantId(input.tenantId)
            : (existing?.tenantId ?? null);

        if (hasExplicitRoleId) {
          await this.assertUniqueRoleKey(tx, id, tenantId, key);
        }

        const role = (await tx.rbacRole.upsert({
          where: { id },
          create: {
            id,
            key,
            tenantId,
            name: input.name,
            description: input.description,
            isSystem: input.isSystem ?? false,
          },
          update: {
            key,
            ...(input.tenantId !== undefined ? { tenantId } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.isSystem !== undefined ? { isSystem: input.isSystem } : {}),
          },
        })) as PrismaRoleRecord;

        if (input.permissions !== undefined) {
          await this.replaceRolePermissions(tx, role.id, input.permissions);
        }

        const reloaded = (await tx.rbacRole.findFirst({
          where: { id: role.id },
          include: { permissions: { include: { permission: true } } },
        })) as PrismaRoleRecord | null;

        if (!reloaded) {
          throw new RbacConfigError({
            operation: 'upsertRole',
            reason: 'role_not_found_after_upsert',
            roleId: role.id,
          });
        }

        return { outcome: existing ? 'updated' : 'created', value: toRole(reloaded) };
      });
    } catch (error) {
      if (!retried && isPrismaUniqueConstraintError(error)) {
        return this.upsertRoleWithRetry(input, true, allowMissingExplicitRole);
      }

      throw error;
    }
  }

  async deleteRole(input: DeleteRoleInput): Promise<void> {
    await this.deleteRoleWithResult(input);
  }

  private async deleteRoleWithResult(input: DeleteRoleInput): Promise<RbacMutationResult> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const deleted = await this.prisma.rbacRole.deleteMany({ where: { id: roleId } });

    return { outcome: mutationCount(deleted) > 0 ? 'deleted' : 'no-op' };
  }

  async grantPermission(input: GrantPermissionInput): Promise<void> {
    await this.grantPermissionWithResult(input, false);
  }

  private async grantPermissionWithResult(
    input: GrantPermissionInput,
    retried: boolean,
  ): Promise<RbacMutationResult> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const permission = normalizePermission(input.permission);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = (await tx.rbacRole.findFirst({
          where: { id: roleId },
        })) as PrismaRoleRecord | null;
        if (!role) return { outcome: 'conflict', reason: 'role_not_found' };

        const permissionRecord = (await tx.rbacPermission.upsert({
          where: { key: permission },
          create: { id: newPrismaRbacId('permission'), key: permission },
          update: {},
        })) as { id: string; key: string };
        const existing = await tx.rbacRolePermission.findFirst({
          where: { roleId, permissionId: permissionRecord.id },
        });
        if (existing) return { outcome: 'no-op' };

        await tx.rbacRolePermission.create({
          data: { roleId, permissionId: permissionRecord.id },
        });

        return { outcome: 'created' };
      });
    } catch (error) {
      if (!retried && isPrismaUniqueConstraintError(error)) {
        return this.grantPermissionWithResult({ roleId, permission }, true);
      }

      throw error;
    }
  }

  async revokePermission(input: RevokePermissionInput): Promise<void> {
    await this.revokePermissionWithResult(input);
  }

  private async revokePermissionWithResult(
    input: RevokePermissionInput,
  ): Promise<RbacMutationResult> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const permission = normalizePermission(input.permission);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.rbacRole.findFirst({ where: { id: roleId } });
      if (!role) return { outcome: 'conflict', reason: 'role_not_found' };

      const permissionRecord = (await tx.rbacPermission.findFirst({
        where: { key: permission },
      })) as { id: string } | null;
      if (!permissionRecord) return { outcome: 'no-op' };

      const deleted = await tx.rbacRolePermission.deleteMany({
        where: { roleId, permissionId: permissionRecord.id },
      });

      return { outcome: mutationCount(deleted) > 0 ? 'deleted' : 'no-op' };
    });
  }

  async listRolePermissions(input: ListRolePermissionsInput): Promise<string[]> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const links = (await this.prisma.rbacRolePermission.findMany({
      where: { roleId },
      include: { permission: true },
      orderBy: { permission: { key: 'asc' } },
    })) as Array<{ permission: { key: string } }>;

    return links.map((link) => link.permission.key);
  }

  async assignRole(input: AssignRoleStorageInput): Promise<RbacRoleBinding> {
    const result = await this.assignRoleWithRetry(canonicalizeAssignInput(input), false);
    if (result.value) return result.value;

    throw new RbacConfigError({
      operation: 'assignRole',
      reason: result.reason ?? 'mutation_result_missing_value',
    });
  }

  private async assignRoleWithRetry(
    input: AssignRoleStorageInput,
    retried: boolean,
  ): Promise<RbacMutationResult<RbacRoleBinding>> {
    const tenantId = normalizeTenantId(input.tenantId);
    const resourceType = input.resource?.type ?? null;
    const resourceId = input.resource?.id ?? null;
    const expiresAt = cloneDate(input.expiresAt);
    const encodedMetadata = encodeMetadata(input.metadata);
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.rbacRole.findFirst({ where: { id: input.roleId } });
        if (!role) return { outcome: 'conflict', reason: 'role_not_found' };

        const existing = (await tx.rbacRoleBinding.findFirst({
          where: {
            tenantId,
            subjectType: input.subject.type,
            subjectId: input.subject.id,
            roleId: input.roleId,
            resourceType,
            resourceId,
            revokedAt: null,
          },
        })) as PrismaBindingRecord | null;

        if (existing) {
          if (isActiveBinding(existing, now)) {
            return { outcome: 'no-op', value: toBinding(existing) };
          }
          if (
            sameDate(existing.expiresAt, expiresAt) &&
            isDeepStrictEqual(existing.metadata, encodedMetadata ?? null)
          ) {
            return { outcome: 'no-op', value: toBinding(existing) };
          }

          const reactivated = (await tx.rbacRoleBinding.update({
            where: { id: existing.id },
            data: {
              expiresAt,
              revokedAt: null,
              metadata: encodedMetadata ?? null,
            },
          })) as PrismaBindingRecord;

          return { outcome: 'updated', value: toBinding(reactivated) };
        }

        const binding = (await tx.rbacRoleBinding.create({
          data: {
            id: newPrismaRbacId('binding'),
            tenantId,
            subjectType: input.subject.type,
            subjectId: input.subject.id,
            roleId: input.roleId,
            resourceType,
            resourceId,
            expiresAt,
            revokedAt: null,
            ...(encodedMetadata !== undefined ? { metadata: encodedMetadata } : {}),
          },
        })) as PrismaBindingRecord;

        return { outcome: 'created', value: toBinding(binding) };
      });
    } catch (error) {
      if (!retried && isPrismaUniqueConstraintError(error)) {
        return this.assignRoleWithRetry(input, true);
      }

      throw error;
    }
  }

  async revokeRole(input: RevokeRoleStorageInput): Promise<void> {
    await this.revokeRoleWithResult(input);
  }

  private async revokeRoleWithResult(input: RevokeRoleStorageInput): Promise<RbacMutationResult> {
    const bindingId = canonicalizeIdentifier(input.bindingId, 'bindingId');
    const revokedAt = cloneDate(input.revokedAt) ?? new Date();
    if (this.prisma.rbacRoleBinding.updateMany) {
      const updated = await this.prisma.rbacRoleBinding.updateMany({
        where: { id: bindingId, revokedAt: null },
        data: { revokedAt },
      });

      return { outcome: mutationCount(updated) > 0 ? 'updated' : 'no-op' };
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = (await tx.rbacRoleBinding.findFirst({
        where: { id: bindingId },
      })) as PrismaBindingRecord | null;
      if (!existing || existing.revokedAt) return { outcome: 'no-op' };

      await tx.rbacRoleBinding.update({ where: { id: bindingId }, data: { revokedAt } });

      return { outcome: 'updated' };
    });
  }

  async listBindings(input: ListBindingsStorageInput): Promise<RbacRoleBinding[]> {
    const subject = canonicalizeSubject(input.subject);
    const bindings = (await this.prisma.rbacRoleBinding.findMany({
      where: {
        subjectType: subject.type,
        subjectId: subject.id,
        ...(input.tenantId !== undefined ? { tenantId: normalizeTenantId(input.tenantId) } : {}),
      },
      orderBy: { id: 'asc' },
    })) as PrismaBindingRecord[];

    return bindings.map(toBinding);
  }

  async listEffectiveRoles(input: ListEffectiveRolesInput): Promise<RbacEffectiveRole[]> {
    const now = input.now ?? new Date();
    const bindings = (await this.prisma.rbacRoleBinding.findMany({
      where: effectiveBindingWhere(input, now),
      include: { role: true },
      orderBy: { id: 'asc' },
    })) as PrismaEffectiveBindingRecord[];

    return bindings.map(toEffectiveRole);
  }

  async listEffectivePermissions(
    input: ListEffectivePermissionsInput,
  ): Promise<RbacEffectivePermission[]> {
    const now = input.now ?? new Date();
    const bindings = (await this.prisma.rbacRoleBinding.findMany({
      where: effectiveBindingWhere(input, now),
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    })) as PrismaEffectiveBindingRecord[];

    return bindings.flatMap((binding) =>
      (binding.role.permissions ?? []).map((link) => ({
        ...toEffectiveRole(binding),
        permission: link.permission.key,
      })),
    );
  }

  private async replaceRolePermissions(
    tx: PrismaRbacTransactionClientLike,
    roleId: string,
    permissions: string[],
  ): Promise<void> {
    await tx.rbacRolePermission.deleteMany({ where: { roleId } });

    for (const permission of normalizePermissions(permissions)) {
      const permissionRecord = (await tx.rbacPermission.upsert({
        where: { key: permission },
        create: { id: newPrismaRbacId('permission'), key: permission },
        update: {},
      })) as { id: string };

      await tx.rbacRolePermission.upsert({
        where: {
          roleId_permissionId: { roleId, permissionId: permissionRecord.id },
        },
        create: { roleId, permissionId: permissionRecord.id },
        update: {},
      });
    }
  }

  private async assertUniqueRoleKey(
    tx: PrismaRbacTransactionClientLike,
    roleId: string,
    tenantId: string | null,
    key: string,
  ): Promise<void> {
    const conflictingRole = (await tx.rbacRole.findFirst({
      where: {
        ...roleWhere(tenantId, key),
        NOT: { id: roleId },
      },
    })) as PrismaRoleRecord | null;

    if (!conflictingRole) return;

    throw new RbacConfigError({
      operation: 'upsertRole',
      reason: 'duplicate_role_key',
      tenantId,
      key,
      roleId,
      conflictingRoleId: conflictingRole.id,
    });
  }
}
