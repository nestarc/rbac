import { isDeepStrictEqual } from 'node:util';
import { RbacConfigError, RbacRoleNotFoundError } from '../errors';
import { normalizePermission, normalizePermissions } from '../utils';
import {
  canonicalizeIdentifier,
  canonicalizeResource,
  canonicalizeSubject,
  canonicalizeTenantId,
} from '../utils/canonicalization';
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
  RbacResourceRef,
  RbacRole,
  RbacRoleBinding,
  RbacStorage,
  RbacStorageMutationCapability,
  RbacStorageRoleLookupCapability,
  RevokePermissionInput,
  RevokeRoleStorageInput,
  UpdateRoleInput,
  UpsertRoleInput,
} from '../interfaces';

type TenantId = string | null;

function normalizeTenantId(tenantId: string | null | undefined): TenantId {
  return canonicalizeTenantId(tenantId) ?? null;
}

function canonicalizeUpsertRoleInput(input: UpsertRoleInput): UpsertRoleInput {
  return 'roleId' in input
    ? {
        ...input,
        roleId: canonicalizeIdentifier(input.roleId, 'roleId'),
        ...(input.tenantId !== undefined ? { tenantId: canonicalizeTenantId(input.tenantId) } : {}),
        ...(input.key !== undefined ? { key: canonicalizeIdentifier(input.key, 'role key') } : {}),
        ...(input.permissions !== undefined
          ? { permissions: normalizePermissions(input.permissions) }
          : {}),
      }
    : {
        ...input,
        tenantId: canonicalizeTenantId(input.tenantId),
        key: canonicalizeIdentifier(input.key, 'role key'),
        permissions: normalizePermissions(input.permissions),
      };
}

function canonicalizeAssignInput(input: AssignRoleStorageInput): AssignRoleStorageInput {
  return {
    ...input,
    tenantId: canonicalizeTenantId(input.tenantId),
    subject: canonicalizeSubject(input.subject),
    roleId: canonicalizeIdentifier(input.roleId, 'roleId'),
    ...(input.resource !== undefined ? { resource: canonicalizeResource(input.resource) } : {}),
  };
}

function cloneDate(date: Date | null | undefined): Date | null {
  return date ? new Date(date) : null;
}

function cloneValue(value: unknown): unknown {
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        cloneValue(nestedValue),
      ]),
    );
  }

  return value;
}

function cloneMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (metadata === undefined) return undefined;
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(metadata);
  }

  return cloneValue(metadata) as Record<string, unknown>;
}

function cloneRole(role: RbacRole): RbacRole {
  return {
    id: role.id,
    key: role.key,
    tenantId: normalizeTenantId(role.tenantId),
    permissions: [...role.permissions],
    ...(role.name !== undefined ? { name: role.name } : {}),
    ...(role.description !== undefined ? { description: role.description } : {}),
    ...(role.isSystem !== undefined ? { isSystem: role.isSystem } : {}),
  };
}

function cloneBinding(binding: RbacRoleBinding): RbacRoleBinding {
  const cloned: RbacRoleBinding = {
    id: binding.id,
    tenantId: normalizeTenantId(binding.tenantId),
    subjectType: binding.subjectType,
    subjectId: binding.subjectId,
    roleId: binding.roleId,
    resourceType: binding.resourceType ?? null,
    resourceId: binding.resourceId ?? null,
    expiresAt: cloneDate(binding.expiresAt),
    revokedAt: cloneDate(binding.revokedAt),
  };
  const metadata = cloneMetadata(binding.metadata);

  if (metadata !== undefined) {
    cloned.metadata = metadata;
  }

  return cloned;
}

function bindingResource(resource: RbacResourceRef | undefined): {
  resourceType: string | null;
  resourceId: string | null;
} {
  return resource
    ? { resourceType: resource.type, resourceId: resource.id }
    : { resourceType: null, resourceId: null };
}

function isBindingActive(binding: RbacRoleBinding, now: Date): boolean {
  if (binding.revokedAt) return false;
  if (!binding.expiresAt) return true;

  return binding.expiresAt.getTime() >= now.getTime();
}

function samePermissions(stored: string[], requested: string[]): boolean {
  const left = [...stored].sort();
  const right = [...requested].sort();

  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function roleInputChanges(role: RbacRole, input: UpsertRoleInput): boolean {
  if (input.key !== undefined && input.key !== role.key) return true;
  if (
    input.tenantId !== undefined &&
    normalizeTenantId(input.tenantId) !== normalizeTenantId(role.tenantId)
  ) {
    return true;
  }
  if (input.name !== undefined && input.name !== role.name) return true;
  if (input.description !== undefined && input.description !== role.description) return true;
  if (input.isSystem !== undefined && input.isSystem !== (role.isSystem ?? false)) return true;

  return input.permissions !== undefined && !samePermissions(role.permissions, input.permissions);
}

export class InMemoryRbacStorage implements RbacStorage, RbacStorageRoleLookupCapability {
  private roleSequence = 0;
  private bindingSequence = 0;
  private readonly roles = new Map<string, RbacRole>();
  private readonly bindings = new Map<string, RbacRoleBinding>();

  readonly mutationResults: RbacStorageMutationCapability = {
    createRole: async (input: CreateRoleInput) => {
      const canonicalInput = canonicalizeUpsertRoleInput(input) as CreateRoleInput;
      const existing = this.findStoredRole(canonicalInput.tenantId, canonicalInput.key);
      if (existing && !roleInputChanges(existing, canonicalInput)) {
        return { outcome: 'no-op', value: cloneRole(existing) };
      }

      const value = await this.upsertRole(canonicalInput);

      return {
        outcome: existing === undefined ? 'created' : 'updated',
        value,
      };
    },
    updateRole: async (input: UpdateRoleInput) => {
      const canonicalInput = canonicalizeUpsertRoleInput(input) as UpdateRoleInput;
      const existing = this.roles.get(canonicalInput.roleId);
      if (!existing) return { outcome: 'conflict', reason: 'role_not_found' };
      if (!roleInputChanges(existing, canonicalInput)) {
        return { outcome: 'no-op', value: cloneRole(existing) };
      }

      const value = await this.upsertRole(canonicalInput);

      return { outcome: 'updated', value };
    },
    deleteRole: async (input: DeleteRoleInput) => {
      const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
      if (!this.roles.has(roleId)) return { outcome: 'no-op' };

      await this.deleteRole({ roleId });

      return { outcome: 'deleted' };
    },
    grantPermission: async (input: GrantPermissionInput) => {
      const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
      const role = this.roles.get(roleId);
      if (!role) return { outcome: 'conflict', reason: 'role_not_found' };

      const permission = normalizePermission(input.permission);
      if (role.permissions.includes(permission)) return { outcome: 'no-op' };

      await this.grantPermission({ roleId, permission });

      return { outcome: 'created' };
    },
    revokePermission: async (input: RevokePermissionInput) => {
      const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
      const role = this.roles.get(roleId);
      if (!role) return { outcome: 'conflict', reason: 'role_not_found' };

      const permission = normalizePermission(input.permission);
      if (!role.permissions.includes(permission)) return { outcome: 'no-op' };

      await this.revokePermission({ roleId, permission });

      return { outcome: 'deleted' };
    },
    assignRole: async (input: AssignRoleStorageInput) => {
      const canonicalInput = canonicalizeAssignInput(input);
      if (!this.roles.has(canonicalInput.roleId)) {
        return { outcome: 'conflict', reason: 'role_not_found' };
      }

      const existing = this.findStoredBinding(canonicalInput);
      const before = existing ? cloneBinding(existing) : undefined;
      const value = await this.assignRole(canonicalInput);

      return {
        outcome:
          before === undefined ? 'created' : isDeepStrictEqual(before, value) ? 'no-op' : 'updated',
        value,
      };
    },
    revokeRole: async (input: RevokeRoleStorageInput) => {
      const bindingId = canonicalizeIdentifier(input.bindingId, 'bindingId');
      const binding = this.bindings.get(bindingId);
      if (!binding || binding.revokedAt) return { outcome: 'no-op' };

      await this.revokeRole({ ...input, bindingId });

      return { outcome: 'updated' };
    },
  };

  findRole(input: FindRoleInput): Promise<RbacRole | null> {
    const tenantId = normalizeTenantId(input.tenantId);
    const key = canonicalizeIdentifier(input.key, 'role key');
    const role = [...this.roles.values()].find(
      (candidate) => normalizeTenantId(candidate.tenantId) === tenantId && candidate.key === key,
    );

    return Promise.resolve(role ? cloneRole(role) : null);
  }

  findRoleById(input: FindRoleByIdInput): Promise<RbacRole | null> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const role = this.roles.get(roleId);

    return Promise.resolve(role ? cloneRole(role) : null);
  }

  listRoles(input: ListRolesInput): Promise<RbacRole[]> {
    const roles = [...this.roles.values()].filter((role) => {
      if (input.tenantId === undefined) return true;

      return normalizeTenantId(role.tenantId) === normalizeTenantId(input.tenantId);
    });

    return Promise.resolve(roles.map(cloneRole));
  }

  upsertRole(input: UpsertRoleInput): Promise<RbacRole> {
    const canonicalInput = canonicalizeUpsertRoleInput(input);

    if ('roleId' in canonicalInput) {
      const existing = this.roles.get(canonicalInput.roleId);
      const role = existing ?? {
        id: canonicalInput.roleId,
        key: canonicalInput.key ?? canonicalInput.roleId,
        tenantId: normalizeTenantId(canonicalInput.tenantId),
        permissions: normalizePermissions(canonicalInput.permissions ?? []),
      };

      const updated: RbacRole = {
        ...role,
        ...(canonicalInput.key !== undefined ? { key: canonicalInput.key } : {}),
        ...(canonicalInput.tenantId !== undefined
          ? { tenantId: normalizeTenantId(canonicalInput.tenantId) }
          : {}),
        ...(canonicalInput.name !== undefined ? { name: canonicalInput.name } : {}),
        ...(canonicalInput.description !== undefined
          ? { description: canonicalInput.description }
          : {}),
        ...(canonicalInput.isSystem !== undefined ? { isSystem: canonicalInput.isSystem } : {}),
        ...(canonicalInput.permissions !== undefined
          ? { permissions: normalizePermissions(canonicalInput.permissions) }
          : { permissions: [...role.permissions] }),
      };
      const duplicateRole = this.findStoredRole(updated.tenantId, updated.key);

      if (duplicateRole && duplicateRole.id !== updated.id) {
        return Promise.reject(
          new RbacConfigError({
            operation: 'upsertRole',
            reason: 'duplicate_role_key',
            tenantId: updated.tenantId,
            key: updated.key,
            roleId: updated.id,
            conflictingRoleId: duplicateRole.id,
          }),
        );
      }

      this.roles.set(updated.id, updated);

      return Promise.resolve(cloneRole(updated));
    }

    const tenantId = normalizeTenantId(canonicalInput.tenantId);
    const existing = [...this.roles.values()].find(
      (role) => normalizeTenantId(role.tenantId) === tenantId && role.key === canonicalInput.key,
    );
    const role: RbacRole = {
      id: existing?.id ?? this.nextRoleId(),
      key: canonicalInput.key,
      tenantId,
      permissions: normalizePermissions(canonicalInput.permissions),
      ...(canonicalInput.name !== undefined
        ? { name: canonicalInput.name }
        : existing?.name !== undefined
          ? { name: existing.name }
          : {}),
      ...(canonicalInput.description !== undefined
        ? { description: canonicalInput.description }
        : existing?.description !== undefined
          ? { description: existing.description }
          : {}),
      ...(canonicalInput.isSystem !== undefined
        ? { isSystem: canonicalInput.isSystem }
        : existing?.isSystem !== undefined
          ? { isSystem: existing.isSystem }
          : {}),
    };

    this.roles.set(role.id, role);

    return Promise.resolve(cloneRole(role));
  }

  deleteRole(input: DeleteRoleInput): Promise<void> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    this.roles.delete(roleId);
    for (const [bindingId, binding] of this.bindings.entries()) {
      if (binding.roleId === roleId) {
        this.bindings.delete(bindingId);
      }
    }

    return Promise.resolve();
  }

  grantPermission(input: GrantPermissionInput): Promise<void> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const role = this.roles.get(roleId);
    if (!role) return Promise.resolve();

    const permission = normalizePermission(input.permission);
    if (role.permissions.includes(permission)) return Promise.resolve();

    role.permissions = [...role.permissions, permission];

    return Promise.resolve();
  }

  revokePermission(input: RevokePermissionInput): Promise<void> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const role = this.roles.get(roleId);
    if (!role) return Promise.resolve();

    const permission = normalizePermission(input.permission);
    role.permissions = role.permissions.filter((candidate) => candidate !== permission);

    return Promise.resolve();
  }

  listRolePermissions(input: ListRolePermissionsInput): Promise<string[]> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    return Promise.resolve([...(this.roles.get(roleId)?.permissions ?? [])]);
  }

  assignRole(input: AssignRoleStorageInput): Promise<RbacRoleBinding> {
    const canonicalInput = canonicalizeAssignInput(input);

    if (!this.roles.has(canonicalInput.roleId)) {
      return Promise.reject(new RbacRoleNotFoundError({ roleId: canonicalInput.roleId }));
    }

    const tenantId = normalizeTenantId(canonicalInput.tenantId);
    const { resourceType, resourceId } = bindingResource(canonicalInput.resource);
    const expiresAt = cloneDate(canonicalInput.expiresAt);
    const now = new Date();
    const existing = [...this.bindings.values()].find(
      (binding) =>
        !binding.revokedAt &&
        normalizeTenantId(binding.tenantId) === tenantId &&
        binding.subjectType === canonicalInput.subject.type &&
        binding.subjectId === canonicalInput.subject.id &&
        binding.roleId === canonicalInput.roleId &&
        (binding.resourceType ?? null) === resourceType &&
        (binding.resourceId ?? null) === resourceId,
    );

    if (existing) {
      if (!isBindingActive(existing, now)) {
        existing.expiresAt = expiresAt;
        existing.revokedAt = null;
        const metadata = cloneMetadata(canonicalInput.metadata);
        if (metadata !== undefined) {
          existing.metadata = metadata;
        } else {
          delete existing.metadata;
        }
      }

      return Promise.resolve(cloneBinding(existing));
    }

    const binding: RbacRoleBinding = {
      id: this.nextBindingId(),
      tenantId,
      subjectType: canonicalInput.subject.type,
      subjectId: canonicalInput.subject.id,
      roleId: canonicalInput.roleId,
      resourceType,
      resourceId,
      expiresAt,
      revokedAt: null,
    };
    const metadata = cloneMetadata(canonicalInput.metadata);

    if (metadata !== undefined) {
      binding.metadata = metadata;
    }

    this.bindings.set(binding.id, binding);

    return Promise.resolve(cloneBinding(binding));
  }

  revokeRole(input: RevokeRoleStorageInput): Promise<void> {
    const bindingId = canonicalizeIdentifier(input.bindingId, 'bindingId');
    const binding = this.bindings.get(bindingId);
    if (!binding || binding.revokedAt) return Promise.resolve();

    binding.revokedAt = new Date(input.revokedAt ?? Date.now());

    return Promise.resolve();
  }

  listBindings(input: ListBindingsStorageInput): Promise<RbacRoleBinding[]> {
    const subject = canonicalizeSubject(input.subject);
    const tenantId = canonicalizeTenantId(input.tenantId);
    const bindings = [...this.bindings.values()].filter((binding) => {
      if (binding.subjectType !== subject.type || binding.subjectId !== subject.id) {
        return false;
      }
      if (input.tenantId === undefined) return true;

      return normalizeTenantId(binding.tenantId) === normalizeTenantId(tenantId);
    });

    return Promise.resolve(bindings.map(cloneBinding));
  }

  listEffectiveRoles(input: ListEffectiveRolesInput): Promise<RbacEffectiveRole[]> {
    return Promise.resolve(this.collectEffectiveRoles(input));
  }

  listEffectivePermissions(
    input: ListEffectivePermissionsInput,
  ): Promise<RbacEffectivePermission[]> {
    const effectiveRoles = this.collectEffectiveRoles(input);

    return Promise.resolve(
      effectiveRoles.flatMap((effectiveRole) => {
        const role = this.roles.get(effectiveRole.roleId);
        if (!role) return [];

        return role.permissions.map((permission) => ({
          ...effectiveRole,
          permission,
        }));
      }),
    );
  }

  private collectEffectiveRoles(input: ListEffectiveRolesInput): RbacEffectiveRole[] {
    const canonicalInput: ListEffectiveRolesInput = {
      ...input,
      subject: canonicalizeSubject(input.subject),
      tenantId: canonicalizeTenantId(input.tenantId),
      ...(input.resource !== undefined ? { resource: canonicalizeResource(input.resource) } : {}),
    };
    const now = canonicalInput.now ?? new Date();

    return [...this.bindings.values()]
      .filter((binding) => this.isEffectiveBinding(binding, canonicalInput, now))
      .map((binding) => {
        const role = this.roles.get(binding.roleId);

        if (!role) return null;

        return this.toEffectiveRole(binding, role);
      })
      .filter((role): role is RbacEffectiveRole => role !== null);
  }

  private isEffectiveBinding(
    binding: RbacRoleBinding,
    input: ListEffectiveRolesInput,
    now: Date,
  ): boolean {
    if (binding.subjectType !== input.subject.type || binding.subjectId !== input.subject.id) {
      return false;
    }
    if (normalizeTenantId(binding.tenantId) !== normalizeTenantId(input.tenantId)) {
      return false;
    }
    if (!isBindingActive(binding, now)) {
      return false;
    }
    const role = this.roles.get(binding.roleId);
    if (!role) {
      return false;
    }
    if (normalizeTenantId(role.tenantId) !== normalizeTenantId(binding.tenantId)) {
      return false;
    }

    const bindingResourceType = binding.resourceType ?? null;
    const bindingResourceId = binding.resourceId ?? null;

    if (!input.resource) {
      return bindingResourceType === null && bindingResourceId === null;
    }

    return (
      (bindingResourceType === null && bindingResourceId === null) ||
      (bindingResourceType === input.resource.type && bindingResourceId === input.resource.id)
    );
  }

  private toEffectiveRole(binding: RbacRoleBinding, role: RbacRole): RbacEffectiveRole {
    return {
      roleKey: role.key,
      roleId: role.id,
      bindingId: binding.id,
      tenantId: normalizeTenantId(binding.tenantId),
      resourceType: binding.resourceType ?? null,
      resourceId: binding.resourceId ?? null,
      expiresAt: cloneDate(binding.expiresAt),
    };
  }

  private findStoredRole(tenantId: string | null | undefined, key: string): RbacRole | undefined {
    const normalizedTenantId = normalizeTenantId(tenantId);

    return [...this.roles.values()].find(
      (role) => normalizeTenantId(role.tenantId) === normalizedTenantId && role.key === key,
    );
  }

  private findStoredBinding(input: AssignRoleStorageInput): RbacRoleBinding | undefined {
    const tenantId = normalizeTenantId(input.tenantId);
    const { resourceType, resourceId } = bindingResource(input.resource);

    return [...this.bindings.values()].find(
      (binding) =>
        !binding.revokedAt &&
        normalizeTenantId(binding.tenantId) === tenantId &&
        binding.subjectType === input.subject.type &&
        binding.subjectId === input.subject.id &&
        binding.roleId === input.roleId &&
        (binding.resourceType ?? null) === resourceType &&
        (binding.resourceId ?? null) === resourceId,
    );
  }

  private nextRoleId(): string {
    let roleId: string;

    do {
      this.roleSequence += 1;
      roleId = `role_${this.roleSequence}`;
    } while (this.roles.has(roleId));

    return roleId;
  }

  private nextBindingId(): string {
    this.bindingSequence += 1;

    return `binding_${this.bindingSequence}`;
  }
}
