import { RbacConfigError } from '../errors';
import type {
  AssignRoleInput,
  CreateRoleInput,
  RbacCanInput,
  RbacModuleOptions,
  RbacRequirementMode,
  RbacRole,
  RbacSubject,
  UpdateRoleInput,
} from '../interfaces';
import { assertNonEmptyString, normalizePermission, normalizePermissions } from '../utils';
import {
  canonicalizeIdentifier,
  canonicalizeResource,
  canonicalizeSubject,
  canonicalizeTenantId,
} from '../utils/canonicalization';
import {
  assertCanInput,
  assertFiniteDate,
  isRbacResourceRef,
  isRbacSubject,
} from '../utils/runtime-validation';

export interface ResolvedTenant {
  tenantId: string | null;
  missing: boolean;
  conflict: boolean;
}

export interface PermissionRequirement {
  permission?: string | undefined;
  permissions: string[];
  mode: RbacRequirementMode;
  invalid: boolean;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

export class RbacServiceInput {
  constructor(private readonly options: RbacModuleOptions) {}

  canonicalizeCan(input: RbacCanInput): RbacCanInput {
    assertCanInput(input);
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

  canonicalizeCreateRole(input: CreateRoleInput): CreateRoleInput {
    this.validateOptionalTenantId(input.tenantId);
    assertNonEmptyString(input.key, 'role key');
    normalizePermissions(input.permissions);

    return {
      ...input,
      tenantId: canonicalizeTenantId(input.tenantId),
      key: canonicalizeIdentifier(input.key, 'role key'),
      permissions: normalizePermissions(input.permissions),
    };
  }

  canonicalizeUpdateRole(input: UpdateRoleInput): UpdateRoleInput {
    assertNonEmptyString(input.roleId, 'roleId');
    this.validateOptionalTenantId(input.tenantId);
    if (input.key !== undefined) assertNonEmptyString(input.key, 'role key');
    if (input.permissions !== undefined) normalizePermissions(input.permissions);

    return {
      ...input,
      roleId: canonicalizeIdentifier(input.roleId, 'roleId'),
      ...(input.tenantId !== undefined ? { tenantId: canonicalizeTenantId(input.tenantId) } : {}),
      ...(input.key !== undefined ? { key: canonicalizeIdentifier(input.key, 'role key') } : {}),
      ...(input.permissions !== undefined
        ? { permissions: normalizePermissions(input.permissions) }
        : {}),
    };
  }

  canonicalizeAssignRole(input: AssignRoleInput): AssignRoleInput {
    this.validateAssignRole(input);
    const base = {
      tenantId: canonicalizeTenantId(input.tenantId),
      subject: canonicalizeSubject(input.subject),
      ...(input.resource !== undefined ? { resource: canonicalizeResource(input.resource) } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    if ('roleId' in input && input.roleId !== undefined) {
      return { ...base, roleId: canonicalizeIdentifier(input.roleId, 'roleId') };
    }

    return { ...base, roleKey: canonicalizeIdentifier(input.roleKey, 'roleKey') };
  }

  resolveTenant(input: RbacCanInput, subject: RbacSubject | undefined): ResolvedTenant {
    const mode =
      input.tenantMode ?? (this.options.tenant?.requiredByDefault ? 'required' : 'optional');
    const explicitTenantId = this.normalizeTenantForComparison(input.tenantId);
    const subjectTenantId = this.normalizeTenantForComparison(subject?.tenantId);
    const conflict =
      explicitTenantId !== undefined &&
      explicitTenantId !== null &&
      subjectTenantId !== undefined &&
      explicitTenantId !== subjectTenantId;

    if (mode === 'none') return { tenantId: null, missing: false, conflict };
    if (input.tenantId === null) {
      return { tenantId: null, missing: mode === 'required', conflict: false };
    }

    const rawTenantId = input.tenantId !== undefined ? input.tenantId : subject?.tenantId;
    const tenantId = isNonEmptyString(rawTenantId) ? rawTenantId.trim() : null;

    return { tenantId, missing: mode === 'required' && tenantId === null, conflict };
  }

  permissionRequirement(input: RbacCanInput): PermissionRequirement {
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

  isRoleCheck(input: RbacCanInput): input is RbacCanInput & { roleKey: string } {
    return 'roleKey' in input && typeof input.roleKey === 'string';
  }

  resolveNow(input: RbacCanInput): Date {
    const now = input.now ?? this.options.now?.() ?? new Date();
    assertFiniteDate(now, 'can', 'now');
    return now;
  }

  validateAssignRoleBoundary(input: AssignRoleInput, role: RbacRole | undefined): void {
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

  private normalizeTenantForComparison(
    tenantId: string | null | undefined,
  ): string | null | undefined {
    if (tenantId === null) return null;
    if (isNonEmptyString(tenantId)) return tenantId.trim();
    return undefined;
  }

  private validateAssignRole(input: AssignRoleInput): void {
    this.validateOptionalTenantId(input.tenantId);
    if (!isRbacSubject(input.subject)) {
      throw new RbacConfigError({
        operation: 'assignRole',
        field: 'subject',
        reason: 'invalid_runtime_shape',
      });
    }
    this.validateAssignRoleSubjectTenant(input);
    const hasRoleId = 'roleId' in input && input.roleId !== undefined;
    const hasRoleKey = 'roleKey' in input && input.roleKey !== undefined;
    if (hasRoleId === hasRoleKey) {
      throw new RbacConfigError({
        reason: 'assignRole() accepts exactly one role identifier per call',
      });
    }
    if (hasRoleId) assertNonEmptyString(input.roleId, 'roleId');
    if (hasRoleKey) assertNonEmptyString(input.roleKey, 'roleKey');
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

  private validateOptionalTenantId(tenantId: string | null | undefined, name = 'tenantId'): void {
    if (tenantId !== null && tenantId !== undefined) assertNonEmptyString(tenantId, name);
  }
}
