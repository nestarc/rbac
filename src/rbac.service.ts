import { Inject, Injectable } from '@nestjs/common';
import { RBAC_OPTIONS } from './constants';
import {
  RbacConfigError,
  RbacPermissionDeniedError,
  RbacRoleNotFoundError,
  RbacStorageError,
} from './errors';
import type {
  AssignRoleInput,
  AssignRoleStorageInput,
  CreateRoleInput,
  DeleteRoleInput,
  GrantPermissionInput,
  ListBindingsInput,
  ListPermissionsInput,
  ListRolesInput,
  RbacCanInput,
  RbacEffectivePermission,
  RbacEffectiveRole,
  RbacModuleOptions,
  RbacResourceRef,
  RbacRole,
  RbacRoleBinding,
  RbacServiceDecision,
  RbacSubject,
  RevokePermissionInput,
  RevokeRoleInput,
  UpdateRoleInput,
} from './interfaces';
import { matchesPermission, matchesResource, normalizePermission } from './utils';
import {
  canonicalizeIdentifier,
  canonicalizeSubject,
  canonicalizeTenantId,
  isCanonicalIdentifier,
} from './utils/canonicalization';
import { RbacServiceDecisionFactory } from './service/rbac-service-decision.factory';
import { RbacServiceInput } from './service/rbac-service-input';
import { RbacServiceMutationSupport } from './service/rbac-service-mutation-support';
import { assertFiniteDate, isRbacSubject } from './utils/runtime-validation';

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function auditResource(resource: RbacResourceRef | undefined): RbacResourceRef | undefined {
  return resource ? { type: resource.type, id: resource.id } : undefined;
}

@Injectable()
export class RbacService {
  private readonly decisions: RbacServiceDecisionFactory;
  private readonly inputs: RbacServiceInput;
  private readonly mutations: RbacServiceMutationSupport;

  constructor(@Inject(RBAC_OPTIONS) private readonly options: RbacModuleOptions) {
    this.decisions = new RbacServiceDecisionFactory();
    this.inputs = new RbacServiceInput(options);
    this.mutations = new RbacServiceMutationSupport(options);
  }

  async can(input: RbacCanInput): Promise<RbacServiceDecision> {
    const canonicalInput = this.inputs.canonicalizeCan(input);
    const subject = isRbacSubject(canonicalInput.subject) ? canonicalInput.subject : undefined;
    const tenant = this.inputs.resolveTenant(canonicalInput, subject);

    if (!subject) {
      return this.decisions.create(canonicalInput, 'denied_subject_missing', {
        allowed: false,
        tenantId: tenant.tenantId,
      });
    }

    if (tenant.conflict) {
      return this.decisions.create(canonicalInput, 'denied_tenant_conflict', {
        allowed: false,
        subject,
        tenantId: tenant.tenantId,
      });
    }

    if (tenant.missing) {
      return this.decisions.create(canonicalInput, 'denied_tenant_missing', {
        allowed: false,
        subject,
        tenantId: tenant.tenantId,
      });
    }

    if (this.inputs.isRoleCheck(canonicalInput)) {
      return this.canRole(canonicalInput, subject, tenant.tenantId);
    }

    return this.canPermission(canonicalInput, subject, tenant.tenantId);
  }

  async assertCan(input: RbacCanInput): Promise<void> {
    const decision = await this.can(input);

    if (decision.allowed) return;

    throw new RbacPermissionDeniedError({ decision: this.decisions.sanitize(decision) });
  }

  async createRole(input: CreateRoleInput): Promise<RbacRole> {
    const canonicalInput = this.inputs.canonicalizeCreateRole(input);
    const result = this.options.storage.mutationResults
      ? await this.options.storage.mutationResults.createRole(canonicalInput)
      : {
          outcome: 'created' as const,
          value: await this.options.storage.upsertRole(canonicalInput),
        };
    if (result.outcome === 'conflict') {
      throw new RbacConfigError({ operation: 'createRole', reason: result.reason ?? 'conflict' });
    }
    const role = this.mutations.requireValue('createRole', result);
    if (result.outcome === 'no-op') return role;
    const created = result.outcome === 'created';
    if (!created && result.outcome !== 'updated') {
      throw new RbacConfigError({ operation: 'createRole', reason: 'invalid_mutation_outcome' });
    }
    await this.mutations.audit({
      type: created ? 'rbac.role.created' : 'rbac.role.updated',
      tenantId: role.tenantId,
      metadata: { roleId: role.id, roleKey: role.key },
    });
    await this.mutations.publish({
      type: created ? 'role.created' : 'role.updated',
      tenantId: role.tenantId,
      roleId: role.id,
      roleKey: role.key,
      permissions: role.permissions,
    });

    return role;
  }

  async updateRole(input: UpdateRoleInput): Promise<RbacRole> {
    const canonicalInput = this.inputs.canonicalizeUpdateRole(input);
    const result = this.options.storage.mutationResults
      ? await this.options.storage.mutationResults.updateRole(canonicalInput)
      : {
          outcome: 'updated' as const,
          value: await this.options.storage.upsertRole(canonicalInput),
        };
    if (result.outcome === 'conflict' && result.reason === 'role_not_found') {
      throw new RbacRoleNotFoundError({ roleId: canonicalInput.roleId });
    }
    const role = this.mutations.requireValue('updateRole', result);
    if (result.outcome === 'no-op') return role;
    if (result.outcome !== 'updated') {
      throw new RbacConfigError({ operation: 'updateRole', reason: 'invalid_mutation_outcome' });
    }
    await this.mutations.audit({
      type: 'rbac.role.updated',
      tenantId: role.tenantId,
      metadata: { roleId: role.id, roleKey: role.key },
    });
    await this.mutations.publish({
      type: 'role.updated',
      tenantId: role.tenantId,
      roleId: role.id,
      roleKey: role.key,
      permissions: role.permissions,
    });

    return role;
  }

  async deleteRole(input: DeleteRoleInput): Promise<void> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const result = this.options.storage.mutationResults
      ? await this.options.storage.mutationResults.deleteRole({ roleId })
      : await this.mutations.legacy(() => this.options.storage.deleteRole({ roleId }), 'deleted');
    if (result.outcome === 'no-op' || result.outcome === 'conflict') return;
    if (result.outcome !== 'deleted') {
      throw new RbacConfigError({ operation: 'deleteRole', reason: 'invalid_mutation_outcome' });
    }
    await this.mutations.audit({
      type: 'rbac.role.deleted',
      metadata: { roleId },
    });
    await this.mutations.publish({
      type: 'role.deleted',
      roleId,
    });
  }

  async grantPermission(input: GrantPermissionInput): Promise<void> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const permission = normalizePermission(input.permission);
    const result = this.options.storage.mutationResults
      ? await this.options.storage.mutationResults.grantPermission({ roleId, permission })
      : await this.mutations.legacy(
          () => this.options.storage.grantPermission({ roleId, permission }),
          'created',
        );
    if (result.outcome === 'no-op' || result.outcome === 'conflict') return;
    if (result.outcome !== 'created' && result.outcome !== 'updated') {
      throw new RbacConfigError({
        operation: 'grantPermission',
        reason: 'invalid_mutation_outcome',
      });
    }
    await this.mutations.audit({
      type: 'rbac.permission.granted',
      metadata: { roleId, permission },
    });
    await this.mutations.publish({
      type: 'permission.granted',
      roleId,
      permissions: [permission],
    });
  }

  async revokePermission(input: RevokePermissionInput): Promise<void> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const permission = normalizePermission(input.permission);
    const result = this.options.storage.mutationResults
      ? await this.options.storage.mutationResults.revokePermission({ roleId, permission })
      : await this.mutations.legacy(
          () => this.options.storage.revokePermission({ roleId, permission }),
          'deleted',
        );
    if (result.outcome === 'no-op' || result.outcome === 'conflict') return;
    if (result.outcome !== 'deleted' && result.outcome !== 'updated') {
      throw new RbacConfigError({
        operation: 'revokePermission',
        reason: 'invalid_mutation_outcome',
      });
    }
    await this.mutations.audit({
      type: 'rbac.permission.revoked',
      metadata: { roleId, permission },
    });
    await this.mutations.publish({
      type: 'permission.revoked',
      roleId,
      permissions: [permission],
    });
  }

  async assignRole(input: AssignRoleInput): Promise<RbacRoleBinding> {
    const canonicalInput = this.inputs.canonicalizeAssignRole(input);
    const { roleId, roleKey, role } = await this.resolveAssignRoleIdentifier(canonicalInput);
    this.inputs.validateAssignRoleBoundary(canonicalInput, role);
    const storageInput: AssignRoleStorageInput = {
      tenantId: canonicalInput.tenantId,
      subject: canonicalInput.subject,
      roleId,
      resource: canonicalInput.resource,
      expiresAt: canonicalInput.expiresAt,
      metadata: canonicalInput.metadata,
    };
    const result = this.options.storage.mutationResults
      ? await this.options.storage.mutationResults.assignRole(storageInput)
      : {
          outcome: 'created' as const,
          value: await this.options.storage.assignRole(storageInput),
        };
    if (result.outcome === 'conflict' && result.reason === 'role_not_found') {
      throw new RbacRoleNotFoundError({ roleId });
    }
    const binding = this.mutations.requireValue('assignRole', result);
    if (result.outcome === 'no-op') return binding;
    if (result.outcome !== 'created' && result.outcome !== 'updated') {
      throw new RbacConfigError({ operation: 'assignRole', reason: 'invalid_mutation_outcome' });
    }
    await this.mutations.audit({
      type: 'rbac.role.assigned',
      tenantId: binding.tenantId,
      subjectType: binding.subjectType,
      subjectId: binding.subjectId,
      metadata: {
        bindingId: binding.id,
        roleId: binding.roleId,
        ...(roleKey !== undefined ? { roleKey } : {}),
        ...(canonicalInput.resource !== undefined
          ? { resource: auditResource(canonicalInput.resource) }
          : {}),
      },
    });
    await this.mutations.publish({
      type: 'role.assigned',
      tenantId: binding.tenantId,
      subject: { type: binding.subjectType, id: binding.subjectId },
      roleId: binding.roleId,
      ...(roleKey !== undefined ? { roleKey } : {}),
      ...(canonicalInput.resource !== undefined
        ? { resource: auditResource(canonicalInput.resource) }
        : {}),
      bindingId: binding.id,
    });

    return binding;
  }

  async revokeRole(input: RevokeRoleInput): Promise<void> {
    const bindingId = canonicalizeIdentifier(input.bindingId, 'bindingId');
    if (input.revokedAt !== undefined) {
      assertFiniteDate(input.revokedAt, 'revokeRole', 'revokedAt');
    }
    const storageInput = { ...input, bindingId };
    const result = this.options.storage.mutationResults
      ? await this.options.storage.mutationResults.revokeRole(storageInput)
      : await this.mutations.legacy(() => this.options.storage.revokeRole(storageInput), 'updated');
    if (result.outcome === 'no-op' || result.outcome === 'conflict') return;
    if (result.outcome !== 'updated' && result.outcome !== 'deleted') {
      throw new RbacConfigError({ operation: 'revokeRole', reason: 'invalid_mutation_outcome' });
    }
    await this.mutations.audit({
      type: 'rbac.role.revoked',
      metadata: { bindingId },
    });
    await this.mutations.publish({
      type: 'role.revoked',
      bindingId,
    });
  }

  listRoles(input: ListRolesInput): Promise<RbacRole[]> {
    return this.options.storage.listRoles({
      ...input,
      ...(input.tenantId !== undefined ? { tenantId: canonicalizeTenantId(input.tenantId) } : {}),
    });
  }

  listPermissions(input: ListPermissionsInput): Promise<string[]> {
    return this.options.storage.listRolePermissions({
      roleId: canonicalizeIdentifier(input.roleId, 'roleId'),
    });
  }

  listBindings(input: ListBindingsInput): Promise<RbacRoleBinding[]> {
    return this.options.storage.listBindings({
      ...input,
      subject: canonicalizeSubject(input.subject),
      ...(input.tenantId !== undefined ? { tenantId: canonicalizeTenantId(input.tenantId) } : {}),
    });
  }

  private async canRole(
    input: RbacCanInput & { roleKey: string },
    subject: RbacSubject,
    tenantId: string | null,
  ): Promise<RbacServiceDecision> {
    const roleKey = input.roleKey.trim();
    if (roleKey === '') {
      return this.decisions.create(input, 'denied_no_matching_role', {
        allowed: false,
        subject,
        tenantId,
        matchedRoleKeys: [],
      });
    }

    const now = this.inputs.resolveNow(input);
    try {
      const roles = await this.listEffectiveRolesForTenant(input, subject, tenantId, now);
      const matchedRoleKeys = unique(
        roles.filter((role) => role.roleKey === roleKey).map((role) => role.roleKey),
      );

      return this.decisions.create(
        input,
        matchedRoleKeys.length > 0 ? 'allowed_by_role' : 'denied_no_matching_role',
        {
          allowed: matchedRoleKeys.length > 0,
          subject,
          tenantId,
          roleKey,
          matchedRoleKeys,
        },
      );
    } catch (error) {
      return this.handleStorageError(input, error, subject, tenantId);
    }
  }

  private async canPermission(
    input: RbacCanInput,
    subject: RbacSubject,
    tenantId: string | null,
  ): Promise<RbacServiceDecision> {
    const requirement = this.inputs.permissionRequirement(input);

    if (requirement.invalid || requirement.permissions.length === 0) {
      return this.decisions.create(input, 'denied_no_matching_permission', {
        allowed: false,
        subject,
        tenantId,
        permission: requirement.permission,
        permissions: requirement.permissions,
        mode: requirement.mode,
        matchedRoleKeys: [],
        matchedPermissions: [],
      });
    }

    const now = this.inputs.resolveNow(input);
    try {
      const effectivePermissions = await this.listEffectivePermissionsForTenant(
        input,
        subject,
        tenantId,
        now,
      );
      const matches = this.matchPermissions(effectivePermissions, requirement.permissions);
      const allowed =
        requirement.mode === 'all'
          ? requirement.permissions.every((required) => matches.byRequired.has(required))
          : matches.matchedPermissions.length > 0;
      const missingPermissions = requirement.permissions.filter(
        (required) => !matches.byRequired.has(required),
      );

      return this.decisions.create(
        input,
        allowed ? 'allowed_by_role_permission' : 'denied_no_matching_permission',
        {
          allowed,
          subject,
          tenantId,
          permission: requirement.permission,
          permissions: requirement.permissions,
          mode: requirement.mode,
          matchedRoleKeys: matches.matchedRoleKeys,
          matchedPermissions: matches.matchedPermissions,
          missingPermissions,
        },
      );
    } catch (error) {
      return this.handleStorageError(input, error, subject, tenantId);
    }
  }

  private matchPermissions(
    effectivePermissions: RbacEffectivePermission[],
    requiredPermissions: string[],
  ): {
    byRequired: Map<string, RbacEffectivePermission[]>;
    matchedRoleKeys: string[];
    matchedPermissions: string[];
  } {
    const byRequired = new Map<string, RbacEffectivePermission[]>();
    const matchedRoleKeys: string[] = [];
    const matchedPermissions: string[] = [];

    for (const required of requiredPermissions) {
      const matches = effectivePermissions.filter((effectivePermission) =>
        matchesPermission(effectivePermission.permission, required),
      );

      if (matches.length > 0) {
        byRequired.set(required, matches);
        matchedRoleKeys.push(...matches.map((match) => match.roleKey));
        matchedPermissions.push(...matches.map((match) => match.permission));
      }
    }

    return {
      byRequired,
      matchedRoleKeys: unique(matchedRoleKeys),
      matchedPermissions: unique(matchedPermissions),
    };
  }

  private async resolveAssignRoleIdentifier(
    input: AssignRoleInput,
  ): Promise<{ roleId: string; roleKey?: string | undefined; role?: RbacRole | undefined }> {
    if ('roleId' in input && input.roleId !== undefined) {
      const roleId = input.roleId.trim();
      const role = this.assignRoleNeedsResolvedRole() ? await this.findRoleById(roleId) : undefined;
      if (this.assignRoleNeedsResolvedRole() && role === undefined) {
        throw new RbacRoleNotFoundError({ roleId });
      }

      return { roleId, role };
    }

    const roleKey = input.roleKey.trim();
    const role = await this.options.storage.findRole({
      tenantId: input.tenantId,
      key: roleKey,
    });

    if (role === null) {
      throw new RbacRoleNotFoundError({ tenantId: input.tenantId, roleKey });
    }

    return { roleId: role.id, roleKey, role };
  }

  private assignRoleNeedsResolvedRole(): boolean {
    const validation = this.options.writeValidation;

    return (
      validation?.rejectTenantMismatch === true ||
      validation?.rejectGlobalRoleInTenantBinding === true
    );
  }

  private async findRoleById(roleId: string): Promise<RbacRole | undefined> {
    if (this.options.storage.findRoleById !== undefined) {
      return (await this.options.storage.findRoleById({ roleId })) ?? undefined;
    }

    const roles = await this.options.storage.listRoles({});

    return roles.find((role) => role.id === roleId);
  }

  private handleStorageError(
    input: RbacCanInput,
    error: unknown,
    subject: RbacSubject,
    tenantId: string | null,
  ): Promise<RbacServiceDecision> | RbacServiceDecision {
    if (this.options.storageErrors === 'throw') {
      throw new RbacStorageError({ operation: 'can' }, { cause: error });
    }

    return this.decisions.create(input, 'denied_storage_error', {
      allowed: false,
      subject,
      tenantId,
    });
  }

  private async listEffectiveRolesForTenant(
    input: RbacCanInput,
    subject: RbacSubject,
    tenantId: string | null,
    now: Date,
  ): Promise<RbacEffectiveRole[]> {
    const tenantRoles = await this.options.storage.listEffectiveRoles({
      subject,
      tenantId,
      resource: input.resource,
      now,
    });
    const validTenantRoles = this.validEffectiveRecords(tenantRoles, tenantId, input.resource, now);

    if (tenantId === null || this.options.tenant?.allowGlobalRolesInTenant !== true) {
      return validTenantRoles;
    }

    const globalRoles = await this.options.storage.listEffectiveRoles({
      subject,
      tenantId: null,
      resource: input.resource,
      now,
    });

    return [
      ...validTenantRoles,
      ...this.validEffectiveRecords(globalRoles, null, input.resource, now),
    ];
  }

  private async listEffectivePermissionsForTenant(
    input: RbacCanInput,
    subject: RbacSubject,
    tenantId: string | null,
    now: Date,
  ): Promise<RbacEffectivePermission[]> {
    const tenantPermissions = await this.options.storage.listEffectivePermissions({
      subject,
      tenantId,
      resource: input.resource,
      now,
    });
    const validTenantPermissions = this.validEffectiveRecords(
      tenantPermissions,
      tenantId,
      input.resource,
      now,
    );

    if (tenantId === null || this.options.tenant?.allowGlobalRolesInTenant !== true) {
      return validTenantPermissions;
    }

    const globalPermissions = await this.options.storage.listEffectivePermissions({
      subject,
      tenantId: null,
      resource: input.resource,
      now,
    });

    return [
      ...validTenantPermissions,
      ...this.validEffectiveRecords(globalPermissions, null, input.resource, now),
    ];
  }

  private validEffectiveRecords<T extends RbacEffectiveRole>(
    records: T[],
    tenantId: string | null,
    resource: RbacResourceRef | undefined,
    now: Date,
  ): T[] {
    return records.filter((record) => this.isValidEffectiveRecord(record, tenantId, resource, now));
  }

  private isValidEffectiveRecord(
    record: unknown,
    tenantId: string | null,
    resource: RbacResourceRef | undefined,
    now: Date,
  ): record is RbacEffectiveRole {
    if (record === null || typeof record !== 'object') return false;

    const effectiveRecord = record as Partial<RbacEffectiveRole>;
    if (
      !isCanonicalIdentifier(effectiveRecord.roleKey) ||
      !isCanonicalIdentifier(effectiveRecord.roleId) ||
      !isCanonicalIdentifier(effectiveRecord.bindingId)
    ) {
      return false;
    }
    if ((effectiveRecord.tenantId ?? null) !== tenantId) return false;
    if (
      effectiveRecord.tenantId !== null &&
      effectiveRecord.tenantId !== undefined &&
      !isCanonicalIdentifier(effectiveRecord.tenantId)
    ) {
      return false;
    }

    if ('permission' in effectiveRecord) {
      const permission = (effectiveRecord as Partial<RbacEffectivePermission>).permission;
      if (typeof permission !== 'string') {
        throw new Error('Stored permission must be a canonical string');
      }
      let normalizedPermission: string;
      try {
        normalizedPermission = normalizePermission(permission);
      } catch {
        throw new Error('Stored permission must be a canonical string');
      }
      if (normalizedPermission !== permission) {
        throw new Error('Stored permission must be a canonical string');
      }
    }

    const expiresAt = effectiveRecord.expiresAt;
    if (expiresAt !== null && expiresAt !== undefined) {
      if (!(expiresAt instanceof Date)) return false;

      const expiresAtTime = expiresAt.getTime();
      if (!Number.isFinite(expiresAtTime) || expiresAtTime < now.getTime()) return false;
    }

    const resourceType = effectiveRecord.resourceType ?? null;
    const resourceId = effectiveRecord.resourceId ?? null;
    if ((resourceType === null) !== (resourceId === null)) return false;
    if (
      resourceType !== null &&
      (!isCanonicalIdentifier(resourceType) || !isCanonicalIdentifier(resourceId))
    ) {
      return false;
    }

    return matchesResource({ resourceType, resourceId }, resource);
  }
}
