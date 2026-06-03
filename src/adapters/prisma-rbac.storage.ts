import { randomUUID } from 'node:crypto';
import { RbacConfigError } from '../errors';
import { normalizePermission, normalizePermissions } from '../utils';
import type {
  AssignRoleStorageInput,
  DeleteRoleInput,
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
  RevokePermissionInput,
  RevokeRoleStorageInput,
  UpsertRoleInput,
} from '../interfaces';

interface PrismaRoleRecord {
  id: string;
  key: string;
  name: string | null;
  description: string | null;
  tenantId: string | null;
  isSystem: boolean;
  permissions?: Array<{ permission: { key: string } }>;
}

type PrismaJson = null | string | number | boolean | PrismaJson[] | { [key: string]: PrismaJson };

interface PrismaBindingRecord {
  id: string;
  tenantId: string | null;
  subjectType: string;
  subjectId: string;
  roleId: string;
  resourceType: string | null;
  resourceId: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  metadata: PrismaJson | null;
}

interface PrismaEffectiveBindingRecord extends PrismaBindingRecord {
  role: PrismaRoleRecord & {
    permissions?: Array<{ permission: { key: string } }>;
  };
}

type PrismaDelegate = {
  findFirst(args?: Record<string, unknown>): Promise<unknown>;
  findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  create(args: Record<string, unknown>): Promise<unknown>;
  update(args: Record<string, unknown>): Promise<unknown>;
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

const normalizeTenantId = (tenantId: string | null | undefined): string | null => tenantId ?? null;

const newId = (prefix: string): string => `${prefix}_${randomUUID()}`;

const metadataTypeKey = '__nestarcRbacJson';
const metadataValueKey = 'value';

const roleWhere = (
  tenantId: string | null,
  key: string,
): { tenantId: string | null; key: string } => ({
  tenantId,
  key,
});

const cloneDate = (date: Date | null | undefined): Date | null => (date ? new Date(date) : null);

const encodeMetadataValue = (value: unknown): PrismaJson | undefined => {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (value instanceof Date) {
    return { [metadataTypeKey]: 'date', [metadataValueKey]: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return {
      [metadataTypeKey]: 'array',
      [metadataValueKey]: value.map((item) => encodeMetadataValue(item) ?? null),
    };
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => [key, encodeMetadataValue(nestedValue)] as const)
      .filter((entry): entry is readonly [string, PrismaJson] => entry[1] !== undefined);

    return { [metadataTypeKey]: 'object', [metadataValueKey]: Object.fromEntries(entries) };
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.description ?? null;
  if (typeof value === 'function') return value.name ? `[Function ${value.name}]` : '[Function]';

  return null;
};

const encodeMetadata = (
  metadata: Record<string, unknown> | undefined,
): Record<string, PrismaJson> | undefined => {
  if (metadata === undefined) return undefined;

  return encodeMetadataValue(metadata) as Record<string, PrismaJson>;
};

const isEncodedMetadataValue = (
  value: unknown,
): value is {
  [metadataTypeKey]: 'array' | 'date' | 'object';
  [metadataValueKey]: PrismaJson;
} => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  const type = candidate[metadataTypeKey];

  return (
    Object.keys(candidate).length === 2 &&
    (type === 'array' || type === 'date' || type === 'object') &&
    metadataValueKey in candidate
  );
};

const decodeMetadataValue = (value: PrismaJson): unknown => {
  if (isEncodedMetadataValue(value)) {
    if (value[metadataTypeKey] === 'date') {
      return typeof value[metadataValueKey] === 'string'
        ? new Date(value[metadataValueKey])
        : value[metadataValueKey];
    }
    if (value[metadataTypeKey] === 'array') {
      return Array.isArray(value[metadataValueKey])
        ? value[metadataValueKey].map(decodeMetadataValue)
        : value[metadataValueKey];
    }
    if (value[metadataValueKey] && typeof value[metadataValueKey] === 'object') {
      return Object.fromEntries(
        Object.entries(value[metadataValueKey]).map(([key, nestedValue]) => [
          key,
          decodeMetadataValue(nestedValue),
        ]),
      );
    }

    return value[metadataValueKey];
  }
  if (Array.isArray(value)) return value.map(decodeMetadataValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, decodeMetadataValue(nestedValue)]),
    );
  }

  return value;
};

const decodeMetadata = (metadata: PrismaJson | null): Record<string, unknown> | undefined => {
  if (metadata === null) return undefined;

  return decodeMetadataValue(metadata) as Record<string, unknown>;
};

const toRole = (record: PrismaRoleRecord): RbacRole => ({
  id: record.id,
  key: record.key,
  tenantId: record.tenantId,
  permissions: record.permissions?.map((entry) => entry.permission.key).sort() ?? [],
  ...(record.name !== null ? { name: record.name } : {}),
  ...(record.description !== null ? { description: record.description } : {}),
  isSystem: record.isSystem,
});

const toBinding = (record: PrismaBindingRecord): RbacRoleBinding => {
  const binding: RbacRoleBinding = {
    id: record.id,
    tenantId: record.tenantId,
    subjectType: record.subjectType,
    subjectId: record.subjectId,
    roleId: record.roleId,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    expiresAt: cloneDate(record.expiresAt),
    revokedAt: cloneDate(record.revokedAt),
  };
  const metadata = decodeMetadata(record.metadata);

  if (metadata !== undefined) {
    binding.metadata = metadata;
  }

  return binding;
};

const toEffectiveRole = (binding: PrismaEffectiveBindingRecord): RbacEffectiveRole => ({
  roleKey: binding.role.key,
  roleId: binding.roleId,
  bindingId: binding.id,
  tenantId: binding.tenantId,
  resourceType: binding.resourceType,
  resourceId: binding.resourceId,
  expiresAt: cloneDate(binding.expiresAt),
});

const isActiveBinding = (binding: PrismaBindingRecord, now: Date): boolean =>
  binding.revokedAt === null &&
  (binding.expiresAt === null || binding.expiresAt.getTime() >= now.getTime());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPrismaUniqueConstraintError = (error: unknown): boolean =>
  isRecord(error) && error.code === 'P2002';

export class PrismaRbacStorage implements RbacStorage {
  constructor(private readonly prisma: PrismaRbacClientLike) {}

  async findRole(input: FindRoleInput): Promise<RbacRole | null> {
    const role = (await this.prisma.rbacRole.findFirst({
      where: roleWhere(normalizeTenantId(input.tenantId), input.key),
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
    return this.upsertRoleWithRetry(input, false);
  }

  private async upsertRoleWithRetry(
    input: UpsertRoleInput,
    retried: boolean,
  ): Promise<RbacRole> {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const explicitRoleId = 'roleId' in input ? input.roleId : undefined;
      let existing: PrismaRoleRecord | null;

      if ('roleId' in input) {
        existing = (await tx.rbacRole.findFirst({
          where: { id: explicitRoleId },
        })) as PrismaRoleRecord | null;
      } else {
        existing = (await tx.rbacRole.findFirst({
          where: roleWhere(normalizeTenantId(input.tenantId), input.key),
        })) as PrismaRoleRecord | null;
      }

      const id = existing?.id ?? explicitRoleId ?? newId('role');
      const key = input.key ?? existing?.key ?? id;
      const tenantId =
        input.tenantId !== undefined
          ? normalizeTenantId(input.tenantId)
          : (existing?.tenantId ?? null);

      await this.assertUniqueRoleKey(tx, id, tenantId, key);

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

      return toRole(reloaded);
      });
    } catch (error) {
      if (!retried && isPrismaUniqueConstraintError(error)) {
        return this.upsertRoleWithRetry(input, true);
      }

      throw error;
    }
  }

  async deleteRole(input: DeleteRoleInput): Promise<void> {
    await this.prisma.rbacRole.deleteMany({ where: { id: input.roleId } });
  }

  async grantPermission(input: GrantPermissionInput): Promise<void> {
    const permission = normalizePermission(input.permission);

    await this.prisma.$transaction(async (tx) => {
      const role = (await tx.rbacRole.findFirst({
        where: { id: input.roleId },
      })) as PrismaRoleRecord | null;
      if (!role) return;

      const permissionRecord = (await tx.rbacPermission.upsert({
        where: { key: permission },
        create: { id: newId('permission'), key: permission },
        update: {},
      })) as { id: string; key: string };

      await tx.rbacRolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: input.roleId, permissionId: permissionRecord.id },
        },
        create: { roleId: input.roleId, permissionId: permissionRecord.id },
        update: {},
      });
    });
  }

  async revokePermission(input: RevokePermissionInput): Promise<void> {
    const permission = normalizePermission(input.permission);
    const permissionRecord = (await this.prisma.rbacPermission.findFirst({
      where: { key: permission },
    })) as { id: string } | null;

    if (!permissionRecord) return;

    await this.prisma.rbacRolePermission.deleteMany({
      where: { roleId: input.roleId, permissionId: permissionRecord.id },
    });
  }

  async listRolePermissions(input: ListRolePermissionsInput): Promise<string[]> {
    const links = (await this.prisma.rbacRolePermission.findMany({
      where: { roleId: input.roleId },
      include: { permission: true },
      orderBy: { permission: { key: 'asc' } },
    })) as Array<{ permission: { key: string } }>;

    return links.map((link) => link.permission.key);
  }

  async assignRole(input: AssignRoleStorageInput): Promise<RbacRoleBinding> {
    return this.assignRoleWithRetry(input, false);
  }

  private async assignRoleWithRetry(
    input: AssignRoleStorageInput,
    retried: boolean,
  ): Promise<RbacRoleBinding> {
    const tenantId = normalizeTenantId(input.tenantId);
    const resourceType = input.resource?.type ?? null;
    const resourceId = input.resource?.id ?? null;
    const expiresAt = cloneDate(input.expiresAt);
    const encodedMetadata = encodeMetadata(input.metadata);
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
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
          return toBinding(existing);
        }

        const reactivated = (await tx.rbacRoleBinding.update({
          where: { id: existing.id },
          data: {
            expiresAt,
            revokedAt: null,
            metadata: encodedMetadata ?? null,
          },
        })) as PrismaBindingRecord;

        return toBinding(reactivated);
      }

      const binding = (await tx.rbacRoleBinding.create({
        data: {
          id: newId('binding'),
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

      return toBinding(binding);
      });
    } catch (error) {
      if (!retried && isPrismaUniqueConstraintError(error)) {
        return this.assignRoleWithRetry(input, true);
      }

      throw error;
    }
  }

  async revokeRole(input: RevokeRoleStorageInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = (await tx.rbacRoleBinding.findFirst({
        where: { id: input.bindingId },
      })) as PrismaBindingRecord | null;

      if (!existing || existing.revokedAt) return;

      await tx.rbacRoleBinding.update({
        where: { id: input.bindingId },
        data: { revokedAt: cloneDate(input.revokedAt) ?? new Date() },
      });
    });
  }

  async listBindings(input: ListBindingsStorageInput): Promise<RbacRoleBinding[]> {
    const bindings = (await this.prisma.rbacRoleBinding.findMany({
      where: {
        subjectType: input.subject.type,
        subjectId: input.subject.id,
        ...(input.tenantId !== undefined ? { tenantId: normalizeTenantId(input.tenantId) } : {}),
      },
      orderBy: { id: 'asc' },
    })) as PrismaBindingRecord[];

    return bindings.map(toBinding);
  }

  async listEffectiveRoles(input: ListEffectiveRolesInput): Promise<RbacEffectiveRole[]> {
    const now = input.now ?? new Date();
    const bindings = (await this.prisma.rbacRoleBinding.findMany({
      where: this.effectiveBindingWhere(input, now),
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
      where: this.effectiveBindingWhere(input, now),
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
        create: { id: newId('permission'), key: permission },
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

  private effectiveBindingWhere(
    input: ListEffectiveRolesInput,
    now: Date,
  ): Record<string, unknown> {
    const tenantId = normalizeTenantId(input.tenantId);
    const resourceFilter = input.resource
      ? {
          OR: [
            { resourceType: null, resourceId: null },
            { resourceType: input.resource.type, resourceId: input.resource.id },
          ],
        }
      : { resourceType: null, resourceId: null };

    return {
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      tenantId,
      revokedAt: null,
      role: { tenantId },
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }, resourceFilter],
    };
  }
}
