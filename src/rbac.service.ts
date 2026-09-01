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
  RbacAuditEvent,
  RbacCanInput,
  RbacDecision,
  RbacDecisionDetails,
  RbacDecisionReason,
  RbacEffectivePermission,
  RbacEffectiveRole,
  RbacModuleOptions,
  RbacMutationResult,
  RbacPolicyChangeEvent,
  RbacRequirementMode,
  RbacResourceRef,
  RbacRole,
  RbacRoleBinding,
  RbacSubject,
  RevokePermissionInput,
  RevokeRoleInput,
  UpdateRoleInput,
} from './interfaces';
import {
  assertNonEmptyString,
  matchesPermission,
  matchesResource,
  normalizePermission,
  normalizePermissions,
} from './utils';
import {
  canonicalizeIdentifier,
  canonicalizeResource,
  canonicalizeSubject,
  canonicalizeTenantId,
  isCanonicalIdentifier,
} from './utils/canonicalization';
import {
  assertCanInput,
  assertFiniteDate,
  isRbacResourceRef,
  isRbacSubject,
} from './utils/runtime-validation';

interface ResolvedTenant {
  tenantId: string | null;
  missing: boolean;
  conflict: boolean;
}

interface PermissionRequirement {
  permission?: string | undefined;
  permissions: string[];
  mode: RbacRequirementMode;
  invalid: boolean;
}

type DecisionOverrides = Partial<RbacDecision> & {
  allowed: boolean;
  missingPermissions?: string[] | undefined;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function auditResource(resource: RbacResourceRef | undefined): RbacResourceRef | undefined {
  return resource ? { type: resource.type, id: resource.id } : undefined;
}

@Injectable()
export class RbacService {
  constructor(@Inject(RBAC_OPTIONS) private readonly options: RbacModuleOptions) {}

  async can(input: RbacCanInput): Promise<RbacDecision> {
    this.validateCanInput(input);
    const canonicalInput = this.canonicalizeCanInput(input);
    const subject = isRbacSubject(canonicalInput.subject) ? canonicalInput.subject : undefined;
    const tenant = this.resolveTenant(canonicalInput, subject);

    if (!subject) {
      return this.decision(canonicalInput, 'denied_subject_missing', {
        allowed: false,
        tenantId: tenant.tenantId,
      });
    }

    if (tenant.conflict) {
      return this.decision(canonicalInput, 'denied_tenant_conflict', {
        allowed: false,
        subject,
        tenantId: tenant.tenantId,
      });
    }

    if (tenant.missing) {
      return this.decision(canonicalInput, 'denied_tenant_missing', {
        allowed: false,
        subject,
        tenantId: tenant.tenantId,
      });
    }

    if (this.isRoleCheck(canonicalInput)) {
      return this.canRole(canonicalInput, subject, tenant.tenantId);
    }

    return this.canPermission(canonicalInput, subject, tenant.tenantId);
  }

  async assertCan(input: RbacCanInput): Promise<void> {
    const decision = await this.can(input);

    if (decision.allowed) return;

    throw new RbacPermissionDeniedError({ decision: this.sanitizeDecision(decision) });
  }

  async createRole(input: CreateRoleInput): Promise<RbacRole> {
    this.validateCreateRoleInput(input);
    const canonicalInput: CreateRoleInput = {
      ...input,
      tenantId: canonicalizeTenantId(input.tenantId),
      key: canonicalizeIdentifier(input.key, 'role key'),
      permissions: normalizePermissions(input.permissions),
    };
    const result = this.options.storage.mutationResults
      ? await this.options.storage.mutationResults.createRole(canonicalInput)
      : {
          outcome: 'created' as const,
          value: await this.options.storage.upsertRole(canonicalInput),
        };
    if (result.outcome === 'conflict') {
      throw new RbacConfigError({ operation: 'createRole', reason: result.reason ?? 'conflict' });
    }
    const role = this.requireMutationValue('createRole', result);
    if (result.outcome === 'no-op') return role;
    const created = result.outcome === 'created';
    if (!created && result.outcome !== 'updated') {
      throw new RbacConfigError({ operation: 'createRole', reason: 'invalid_mutation_outcome' });
    }
    await this.logAudit({
      type: created ? 'rbac.role.created' : 'rbac.role.updated',
      tenantId: role.tenantId,
      metadata: { roleId: role.id, roleKey: role.key },
    });
    await this.publishChange({
      type: created ? 'role.created' : 'role.updated',
      tenantId: role.tenantId,
      roleId: role.id,
      roleKey: role.key,
      permissions: role.permissions,
    });

    return role;
  }

  async updateRole(input: UpdateRoleInput): Promise<RbacRole> {
    this.validateUpdateRoleInput(input);
    const canonicalInput: UpdateRoleInput = {
      ...input,
      roleId: canonicalizeIdentifier(input.roleId, 'roleId'),
      ...(input.tenantId !== undefined ? { tenantId: canonicalizeTenantId(input.tenantId) } : {}),
      ...(input.key !== undefined ? { key: canonicalizeIdentifier(input.key, 'role key') } : {}),
      ...(input.permissions !== undefined
        ? { permissions: normalizePermissions(input.permissions) }
        : {}),
    };
    const result = this.options.storage.mutationResults
      ? await this.options.storage.mutationResults.updateRole(canonicalInput)
      : {
          outcome: 'updated' as const,
          value: await this.options.storage.upsertRole(canonicalInput),
        };
    if (result.outcome === 'conflict' && result.reason === 'role_not_found') {
      throw new RbacRoleNotFoundError({ roleId: canonicalInput.roleId });
    }
    const role = this.requireMutationValue('updateRole', result);
    if (result.outcome === 'no-op') return role;
    if (result.outcome !== 'updated') {
      throw new RbacConfigError({ operation: 'updateRole', reason: 'invalid_mutation_outcome' });
    }
    await this.logAudit({
      type: 'rbac.role.updated',
      tenantId: role.tenantId,
      metadata: { roleId: role.id, roleKey: role.key },
    });
    await this.publishChange({
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
      : await this.legacyMutation(() => this.options.storage.deleteRole({ roleId }), 'deleted');
    if (result.outcome === 'no-op' || result.outcome === 'conflict') return;
    if (result.outcome !== 'deleted') {
      throw new RbacConfigError({ operation: 'deleteRole', reason: 'invalid_mutation_outcome' });
    }
    await this.logAudit({
      type: 'rbac.role.deleted',
      metadata: { roleId },
    });
    await this.publishChange({
      type: 'role.deleted',
      roleId,
    });
  }

  async grantPermission(input: GrantPermissionInput): Promise<void> {
    const roleId = canonicalizeIdentifier(input.roleId, 'roleId');
    const permission = normalizePermission(input.permission);
    const result = this.options.storage.mutationResults
      ? await this.options.storage.mutationResults.grantPermission({ roleId, permission })
      : await this.legacyMutation(
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
    await this.logAudit({
      type: 'rbac.permission.granted',
      metadata: { roleId, permission },
    });
    await this.publishChange({
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
      : await this.legacyMutation(
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
    await this.logAudit({
      type: 'rbac.permission.revoked',
      metadata: { roleId, permission },
    });
    await this.publishChange({
      type: 'permission.revoked',
      roleId,
      permissions: [permission],
    });
  }

  async assignRole(input: AssignRoleInput): Promise<RbacRoleBinding> {
    this.validateAssignRoleInput(input);
    const canonicalInput = this.canonicalizeAssignRoleInput(input);
    const { roleId, roleKey, role } = await this.resolveAssignRoleIdentifier(canonicalInput);
    this.validateAssignRoleBoundary(canonicalInput, role);
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
    const binding = this.requireMutationValue('assignRole', result);
    if (result.outcome === 'no-op') return binding;
    if (result.outcome !== 'created' && result.outcome !== 'updated') {
      throw new RbacConfigError({ operation: 'assignRole', reason: 'invalid_mutation_outcome' });
    }
    await this.logAudit({
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
    await this.publishChange({
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
      : await this.legacyMutation(() => this.options.storage.revokeRole(storageInput), 'updated');
    if (result.outcome === 'no-op' || result.outcome === 'conflict') return;
    if (result.outcome !== 'updated' && result.outcome !== 'deleted') {
      throw new RbacConfigError({ operation: 'revokeRole', reason: 'invalid_mutation_outcome' });
    }
    await this.logAudit({
      type: 'rbac.role.revoked',
      metadata: { bindingId },
    });
    await this.publishChange({
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
  ): Promise<RbacDecision> {
    const roleKey = input.roleKey.trim();
    if (roleKey === '') {
      return this.decision(input, 'denied_no_matching_role', {
        allowed: false,
        subject,
        tenantId,
        matchedRoleKeys: [],
      });
    }

    const now = this.resolveNow(input);
    try {
      const roles = await this.listEffectiveRolesForTenant(input, subject, tenantId, now);
      const matchedRoleKeys = unique(
        roles.filter((role) => role.roleKey === roleKey).map((role) => role.roleKey),
      );

      return this.decision(
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
  ): Promise<RbacDecision> {
    const requirement = this.resolvePermissionRequirement(input);

    if (requirement.invalid || requirement.permissions.length === 0) {
      return this.decision(input, 'denied_no_matching_permission', {
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

    const now = this.resolveNow(input);
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

      return this.decision(
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

  private resolveTenant(input: RbacCanInput, subject: RbacSubject | undefined): ResolvedTenant {
    const mode =
      input.tenantMode ?? (this.options.tenant?.requiredByDefault ? 'required' : 'optional');

    const explicitTenantId = this.normalizeTenantForComparison(input.tenantId);
    const subjectTenantId = this.normalizeTenantForComparison(subject?.tenantId);
    const conflict =
      explicitTenantId !== undefined &&
      explicitTenantId !== null &&
      subjectTenantId !== undefined &&
      explicitTenantId !== subjectTenantId;

    if (mode === 'none') {
      return { tenantId: null, missing: false, conflict };
    }
    if (input.tenantId === null) {
      return { tenantId: null, missing: mode === 'required', conflict: false };
    }

    const rawTenantId = input.tenantId !== undefined ? input.tenantId : subject?.tenantId;
    const tenantId = isNonEmptyString(rawTenantId) ? rawTenantId.trim() : null;

    return {
      tenantId,
      missing: mode === 'required' && tenantId === null,
      conflict,
    };
  }

  private normalizeTenantForComparison(
    tenantId: string | null | undefined,
  ): string | null | undefined {
    if (tenantId === null) return null;
    if (isNonEmptyString(tenantId)) return tenantId.trim();

    return undefined;
  }

  private resolvePermissionRequirement(input: RbacCanInput): PermissionRequirement {
    const permission = 'permission' in input ? input.permission : undefined;
    const rawPermissions = this.rawPermissions(input);
    const mode = input.mode ?? (rawPermissions.length > 1 ? 'all' : 'any');

    try {
      return {
        permission: permission ? normalizePermission(permission) : undefined,
        permissions: normalizePermissions(rawPermissions),
        mode,
        invalid: false,
      };
    } catch {
      return {
        permission: typeof permission === 'string' ? permission : undefined,
        permissions: rawPermissions.filter(
          (candidate): candidate is string => typeof candidate === 'string',
        ),
        mode,
        invalid: true,
      };
    }
  }

  private rawPermissions(input: RbacCanInput): string[] {
    const permissions: string[] = [];
    if ('permission' in input && typeof input.permission === 'string') {
      permissions.push(input.permission);
    }
    if ('permissions' in input && Array.isArray(input.permissions)) {
      permissions.push(
        ...input.permissions.filter(
          (permission): permission is string => typeof permission === 'string',
        ),
      );
    }

    return permissions;
  }

  private validateCanInput(input: RbacCanInput): void {
    assertCanInput(input);
  }

  private canonicalizeCanInput(input: RbacCanInput): RbacCanInput {
    const base = {
      ...input,
      ...(input.subject !== undefined ? { subject: canonicalizeSubject(input.subject) } : {}),
      ...(input.tenantId !== undefined ? { tenantId: canonicalizeTenantId(input.tenantId) } : {}),
      ...(input.resource !== undefined ? { resource: canonicalizeResource(input.resource) } : {}),
    };

    if ('roleKey' in input && input.roleKey !== undefined) {
      return {
        ...base,
        roleKey: canonicalizeIdentifier(input.roleKey, 'roleKey'),
      } as RbacCanInput;
    }

    return {
      ...base,
      ...('permission' in input && input.permission !== undefined
        ? { permission: normalizePermission(input.permission) }
        : {}),
      ...('permissions' in input && input.permissions !== undefined
        ? { permissions: normalizePermissions(input.permissions) }
        : {}),
    } as RbacCanInput;
  }

  private canonicalizeAssignRoleInput(input: AssignRoleInput): AssignRoleInput {
    const base = {
      tenantId: canonicalizeTenantId(input.tenantId),
      subject: canonicalizeSubject(input.subject),
      ...(input.resource !== undefined ? { resource: canonicalizeResource(input.resource) } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    if ('roleId' in input && input.roleId !== undefined) {
      return {
        ...base,
        roleId: canonicalizeIdentifier(input.roleId, 'roleId'),
      };
    }

    return {
      ...base,
      roleKey: canonicalizeIdentifier(input.roleKey, 'roleKey'),
    };
  }

  private sanitizeDecision(decision: RbacDecision): RbacDecision {
    return {
      ...decision,
      subject: decision.subject ? this.sanitizeSubject(decision.subject) : undefined,
    };
  }

  private sanitizeSubject(subject: RbacSubject): RbacSubject {
    return {
      type: subject.type,
      id: subject.id,
      ...(subject.tenantId !== undefined ? { tenantId: subject.tenantId } : {}),
    };
  }

  private validateCreateRoleInput(input: CreateRoleInput): void {
    this.validateOptionalTenantId(input.tenantId);
    assertNonEmptyString(input.key, 'role key');
    normalizePermissions(input.permissions);
  }

  private validateUpdateRoleInput(input: UpdateRoleInput): void {
    assertNonEmptyString(input.roleId, 'roleId');
    this.validateOptionalTenantId(input.tenantId);
    if (input.key !== undefined) {
      assertNonEmptyString(input.key, 'role key');
    }
    if (input.permissions !== undefined) {
      normalizePermissions(input.permissions);
    }
  }

  private validateAssignRoleInput(input: AssignRoleInput): void {
    this.validateOptionalTenantId(input.tenantId);
    this.validateSubjectForWrite(input.subject);
    this.validateAssignRoleSubjectTenant(input);
    const hasRoleId = 'roleId' in input && input.roleId !== undefined;
    const hasRoleKey = 'roleKey' in input && input.roleKey !== undefined;
    if (hasRoleId === hasRoleKey) {
      throw new RbacConfigError({
        reason: 'assignRole() accepts exactly one role identifier per call',
      });
    }
    if (hasRoleId) {
      assertNonEmptyString(input.roleId, 'roleId');
    }
    if (hasRoleKey) {
      assertNonEmptyString(input.roleKey, 'roleKey');
    }
    if (input.resource !== undefined && !isRbacResourceRef(input.resource)) {
      throw new RbacConfigError({
        operation: 'assignRole',
        field: 'resource',
        reason: 'invalid_runtime_shape',
      });
    }
    if (input.expiresAt !== undefined && input.expiresAt !== null) {
      assertFiniteDate(input.expiresAt, 'assignRole', 'expiresAt');
    }
  }

  private validateAssignRoleSubjectTenant(input: AssignRoleInput): void {
    if (
      this.options.writeValidation?.rejectTenantMismatch !== true ||
      input.subject.tenantId === undefined
    ) {
      return;
    }

    const subjectTenantId = input.subject.tenantId?.trim() ?? null;
    const bindingTenantId = input.tenantId?.trim() ?? null;
    if (subjectTenantId === bindingTenantId) return;

    throw new RbacConfigError({
      operation: 'assignRole',
      reason: 'subject_tenant_mismatch',
      subjectTenantId,
      bindingTenantId,
    });
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
    const roles = await this.options.storage.listRoles({});

    return roles.find((role) => role.id === roleId);
  }

  private validateAssignRoleBoundary(input: AssignRoleInput, role: RbacRole | undefined): void {
    const validation = this.options.writeValidation;

    if (
      validation?.rejectResourceWithoutTenant === true &&
      input.resource !== undefined &&
      input.tenantId == null
    ) {
      throw new RbacConfigError({
        operation: 'assignRole',
        reason: 'resource_binding_requires_tenant',
      });
    }

    if (role === undefined) return;

    const roleTenantId = role.tenantId ?? null;
    const bindingTenantId = input.tenantId ?? null;

    if (
      validation?.rejectTenantMismatch === true &&
      roleTenantId !== null &&
      roleTenantId !== bindingTenantId
    ) {
      throw new RbacConfigError({
        operation: 'assignRole',
        reason: 'role_tenant_mismatch',
        roleId: role.id,
        roleTenantId,
        bindingTenantId,
      });
    }

    if (
      validation?.rejectGlobalRoleInTenantBinding === true &&
      roleTenantId === null &&
      bindingTenantId !== null
    ) {
      throw new RbacConfigError({
        operation: 'assignRole',
        reason: 'global_role_tenant_binding_rejected',
        roleId: role.id,
        bindingTenantId,
      });
    }
  }

  private validateSubjectForWrite(subject: RbacSubject): void {
    if (!isRbacSubject(subject)) {
      throw new RbacConfigError({
        operation: 'assignRole',
        field: 'subject',
        reason: 'invalid_runtime_shape',
      });
    }
  }

  private validateOptionalTenantId(tenantId: string | null | undefined, name = 'tenantId'): void {
    if (tenantId !== null && tenantId !== undefined) {
      assertNonEmptyString(tenantId, name);
    }
  }

  private isRoleCheck(input: RbacCanInput): input is RbacCanInput & { roleKey: string } {
    return 'roleKey' in input && typeof input.roleKey === 'string';
  }

  private resolveNow(input: RbacCanInput): Date {
    const now = input.now ?? this.options.now?.() ?? new Date();
    assertFiniteDate(now, 'can', 'now');

    return now;
  }

  private handleStorageError(
    input: RbacCanInput,
    error: unknown,
    subject: RbacSubject,
    tenantId: string | null,
  ): Promise<RbacDecision> | RbacDecision {
    if (this.options.storageErrors === 'throw') {
      throw new RbacStorageError({ operation: 'can' }, { cause: error });
    }

    return this.decision(input, 'denied_storage_error', {
      allowed: false,
      subject,
      tenantId,
    });
  }

  private decision(
    input: RbacCanInput,
    reason: RbacDecisionReason,
    overrides: DecisionOverrides,
  ): RbacDecision {
    const decision: RbacDecision = {
      allowed: overrides.allowed,
      reason,
      subject: overrides.subject ?? input.subject,
      tenantId: overrides.tenantId,
      permission: overrides.permission ?? ('permission' in input ? input.permission : undefined),
      permissions: overrides.permissions ?? this.rawPermissions(input),
      roleKey: overrides.roleKey ?? ('roleKey' in input ? input.roleKey : undefined),
      mode: overrides.mode ?? ('mode' in input ? input.mode : undefined),
      matchedRoleKeys: overrides.matchedRoleKeys,
      matchedPermissions: overrides.matchedPermissions,
      resource: input.resource,
    };
    decision.details = overrides.details ?? this.buildDecisionDetails(decision, overrides);

    return decision;
  }

  private buildDecisionDetails(
    decision: RbacDecision,
    overrides: DecisionOverrides,
  ): RbacDecisionDetails {
    const requirement = this.buildRequirementDetails(decision);
    const matched = this.buildMatchedDetails(decision);
    const missing = this.buildMissingDetails(decision, overrides);

    return {
      ...(requirement !== undefined ? { requirement } : {}),
      ...(matched !== undefined ? { matched } : {}),
      ...(missing !== undefined ? { missing } : {}),
      evaluationPath: [this.evaluationStep(decision.reason)],
      safeMessage: decision.reason,
    };
  }

  private buildRequirementDetails(
    decision: RbacDecision,
  ): NonNullable<RbacDecisionDetails['requirement']> | undefined {
    if (decision.roleKey !== undefined) {
      return { type: 'role', roleKeys: [decision.roleKey] };
    }

    if (decision.permissions !== undefined) {
      return {
        type: 'permission',
        permissions: decision.permissions,
        mode: decision.mode ?? (decision.permissions.length > 1 ? 'all' : 'any'),
      };
    }

    return undefined;
  }

  private buildMatchedDetails(
    decision: RbacDecision,
  ): NonNullable<RbacDecisionDetails['matched']> | undefined {
    if (decision.matchedRoleKeys === undefined && decision.matchedPermissions === undefined) {
      return undefined;
    }

    return {
      ...(decision.matchedRoleKeys !== undefined ? { roleKeys: decision.matchedRoleKeys } : {}),
      ...(decision.matchedPermissions !== undefined
        ? { permissions: decision.matchedPermissions }
        : {}),
    };
  }

  private buildMissingDetails(
    decision: RbacDecision,
    overrides: DecisionOverrides,
  ): NonNullable<RbacDecisionDetails['missing']> | undefined {
    switch (decision.reason) {
      case 'denied_subject_missing':
        return { subject: true };
      case 'denied_tenant_missing':
        return { tenant: true };
      case 'denied_tenant_conflict':
        return undefined;
      case 'denied_resource_missing':
      case 'denied_resource_mismatch':
        return { resource: true };
      case 'denied_no_matching_role':
        return decision.roleKey !== undefined ? { roleKeys: [decision.roleKey] } : undefined;
      case 'denied_no_matching_permission':
        return {
          permissions: overrides.missingPermissions ?? decision.permissions ?? [],
        };
      default:
        return undefined;
    }
  }

  private evaluationStep(
    reason: RbacDecisionReason,
  ): NonNullable<RbacDecisionDetails['evaluationPath']>[number] {
    switch (reason) {
      case 'allowed_by_role':
        return { code: 'role_matched', outcome: 'allow' };
      case 'allowed_by_role_permission':
        return { code: 'permission_matched', outcome: 'allow' };
      case 'denied_subject_missing':
        return { code: 'subject_missing', outcome: 'deny' };
      case 'denied_tenant_missing':
        return { code: 'tenant_missing', outcome: 'deny' };
      case 'denied_tenant_conflict':
        return { code: 'tenant_conflict', outcome: 'deny' };
      case 'denied_resource_missing':
        return { code: 'resource_missing', outcome: 'deny' };
      case 'denied_resource_mismatch':
        return { code: 'resource_mismatch', outcome: 'deny' };
      case 'denied_no_matching_role':
      case 'denied_role_expired':
        return { code: 'role_missing', outcome: 'deny' };
      case 'denied_no_matching_permission':
        return { code: 'permission_missing', outcome: 'deny' };
      case 'denied_storage_error':
        return { code: 'storage_error', outcome: 'deny' };
    }
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

  private async logAudit(event: RbacAuditEvent): Promise<void> {
    try {
      await this.options.auditLogger?.log(event);
    } catch {
      // Audit logging must not change RBAC write or authorization behavior.
    }
  }

  private requireMutationValue<T>(operation: string, result: RbacMutationResult<T>): T {
    if (result.value !== undefined) return result.value;

    throw new RbacConfigError({
      operation,
      reason: result.reason ?? 'mutation_result_missing_value',
      outcome: result.outcome,
    });
  }

  private async legacyMutation(
    mutation: () => Promise<void>,
    outcome: 'created' | 'updated' | 'deleted',
  ): Promise<RbacMutationResult> {
    await mutation();

    return { outcome };
  }

  private async publishChange(event: Omit<RbacPolicyChangeEvent, 'occurredAt'>): Promise<void> {
    try {
      await this.options.changePublisher?.publish({
        occurredAt: this.options.now?.() ?? new Date(),
        ...event,
      });
    } catch {
      // Change hooks are for cache/outbox integration and must not alter write results.
    }
  }
}
