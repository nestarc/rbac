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
  RbacResourceRef,
  RbacRole,
  RbacRoleBinding,
  RbacStorage,
  RevokePermissionInput,
  RevokeRoleStorageInput,
  UpsertRoleInput,
} from '../interfaces';

type TenantId = string | null;

function normalizeTenantId(tenantId: string | null | undefined): TenantId {
  return tenantId ?? null;
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

export class InMemoryRbacStorage implements RbacStorage {
  private roleSequence = 0;
  private bindingSequence = 0;
  private readonly roles = new Map<string, RbacRole>();
  private readonly bindings = new Map<string, RbacRoleBinding>();

  findRole(input: FindRoleInput): Promise<RbacRole | null> {
    const tenantId = normalizeTenantId(input.tenantId);
    const role = [...this.roles.values()].find(
      (candidate) =>
        normalizeTenantId(candidate.tenantId) === tenantId && candidate.key === input.key,
    );

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
    if ('roleId' in input) {
      const existing = this.roles.get(input.roleId);
      const role = existing ?? {
        id: input.roleId,
        key: input.key ?? input.roleId,
        tenantId: normalizeTenantId(input.tenantId),
        permissions: normalizePermissions(input.permissions ?? []),
      };

      const updated: RbacRole = {
        ...role,
        ...(input.key !== undefined ? { key: input.key } : {}),
        ...(input.tenantId !== undefined ? { tenantId: normalizeTenantId(input.tenantId) } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isSystem !== undefined ? { isSystem: input.isSystem } : {}),
        ...(input.permissions !== undefined
          ? { permissions: normalizePermissions(input.permissions) }
          : { permissions: [...role.permissions] }),
      };

      this.roles.set(updated.id, updated);

      return Promise.resolve(cloneRole(updated));
    }

    const tenantId = normalizeTenantId(input.tenantId);
    const existing = [...this.roles.values()].find(
      (role) => normalizeTenantId(role.tenantId) === tenantId && role.key === input.key,
    );
    const role: RbacRole = {
      id: existing?.id ?? this.nextRoleId(),
      key: input.key,
      tenantId,
      permissions: normalizePermissions(input.permissions),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isSystem !== undefined ? { isSystem: input.isSystem } : {}),
    };

    this.roles.set(role.id, role);

    return Promise.resolve(cloneRole(role));
  }

  deleteRole(input: DeleteRoleInput): Promise<void> {
    this.roles.delete(input.roleId);

    return Promise.resolve();
  }

  grantPermission(input: GrantPermissionInput): Promise<void> {
    const role = this.roles.get(input.roleId);
    if (!role) return Promise.resolve();

    const permission = normalizePermission(input.permission);
    if (role.permissions.includes(permission)) return Promise.resolve();

    role.permissions = [...role.permissions, permission];

    return Promise.resolve();
  }

  revokePermission(input: RevokePermissionInput): Promise<void> {
    const role = this.roles.get(input.roleId);
    if (!role) return Promise.resolve();

    const permission = normalizePermission(input.permission);
    role.permissions = role.permissions.filter((candidate) => candidate !== permission);

    return Promise.resolve();
  }

  listRolePermissions(input: ListRolePermissionsInput): Promise<string[]> {
    return Promise.resolve([...(this.roles.get(input.roleId)?.permissions ?? [])]);
  }

  assignRole(input: AssignRoleStorageInput): Promise<RbacRoleBinding> {
    const tenantId = normalizeTenantId(input.tenantId);
    const { resourceType, resourceId } = bindingResource(input.resource);
    const expiresAt = cloneDate(input.expiresAt);
    const now = new Date();
    const existing = [...this.bindings.values()].find(
      (binding) =>
        isBindingActive(binding, now) &&
        normalizeTenantId(binding.tenantId) === tenantId &&
        binding.subjectType === input.subject.type &&
        binding.subjectId === input.subject.id &&
        binding.roleId === input.roleId &&
        (binding.resourceType ?? null) === resourceType &&
        (binding.resourceId ?? null) === resourceId,
    );

    if (existing) return Promise.resolve(cloneBinding(existing));

    const binding: RbacRoleBinding = {
      id: this.nextBindingId(),
      tenantId,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      roleId: input.roleId,
      resourceType,
      resourceId,
      expiresAt,
      revokedAt: null,
    };
    const metadata = cloneMetadata(input.metadata);

    if (metadata !== undefined) {
      binding.metadata = metadata;
    }

    this.bindings.set(binding.id, binding);

    return Promise.resolve(cloneBinding(binding));
  }

  revokeRole(input: RevokeRoleStorageInput): Promise<void> {
    const binding = this.bindings.get(input.bindingId);
    if (!binding || binding.revokedAt) return Promise.resolve();

    binding.revokedAt = new Date(input.revokedAt ?? Date.now());

    return Promise.resolve();
  }

  listBindings(input: ListBindingsStorageInput): Promise<RbacRoleBinding[]> {
    const bindings = [...this.bindings.values()].filter((binding) => {
      if (binding.subjectType !== input.subject.type || binding.subjectId !== input.subject.id) {
        return false;
      }
      if (input.tenantId === undefined) return true;

      return normalizeTenantId(binding.tenantId) === normalizeTenantId(input.tenantId);
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
    const now = input.now ?? new Date();

    return [...this.bindings.values()]
      .filter((binding) => this.isEffectiveBinding(binding, input, now))
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

  private nextRoleId(): string {
    this.roleSequence += 1;

    return `role_${this.roleSequence}`;
  }

  private nextBindingId(): string {
    this.bindingSequence += 1;

    return `binding_${this.bindingSequence}`;
  }
}
