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
  RbacDecisionReason,
  RbacEffectivePermission,
  RbacEffectiveRole,
  RbacModuleOptions,
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

interface ResolvedTenant {
  tenantId: string | null;
  missing: boolean;
}

interface PermissionRequirement {
  permission?: string | undefined;
  permissions: string[];
  mode: RbacRequirementMode;
  invalid: boolean;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function hasSubject(subject: RbacSubject | undefined): subject is RbacSubject {
  return (
    subject !== undefined &&
    isNonEmptyString(subject.type) &&
    isNonEmptyString(subject.id)
  );
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
    const subject = hasSubject(input.subject) ? input.subject : undefined;
    const tenant = this.resolveTenant(input, subject);

    if (!subject) {
      return this.decision(input, 'denied_subject_missing', {
        allowed: false,
        tenantId: tenant.tenantId,
      });
    }

    if (tenant.missing) {
      return this.decision(input, 'denied_tenant_missing', {
        allowed: false,
        subject,
        tenantId: tenant.tenantId,
      });
    }

    if (this.isRoleCheck(input)) {
      return this.canRole(input, subject, tenant.tenantId);
    }

    return this.canPermission(input, subject, tenant.tenantId);
  }

  async assertCan(input: RbacCanInput): Promise<void> {
    const decision = await this.can(input);

    if (decision.allowed) return;

    throw new RbacPermissionDeniedError({ decision: this.sanitizeDecision(decision) });
  }

  async createRole(input: CreateRoleInput): Promise<RbacRole> {
    this.validateCreateRoleInput(input);
    const role = await this.options.storage.upsertRole(input);
    await this.logAudit({
      type: 'rbac.role.created',
      tenantId: role.tenantId,
      metadata: { roleId: role.id, roleKey: role.key },
    });

    return role;
  }

  async updateRole(input: UpdateRoleInput): Promise<RbacRole> {
    this.validateUpdateRoleInput(input);
    const role = await this.options.storage.upsertRole(input);
    await this.logAudit({
      type: 'rbac.role.updated',
      tenantId: role.tenantId,
      metadata: { roleId: role.id, roleKey: role.key },
    });

    return role;
  }

  async deleteRole(input: DeleteRoleInput): Promise<void> {
    assertNonEmptyString(input.roleId, 'roleId');
    await this.options.storage.deleteRole(input);
    await this.logAudit({
      type: 'rbac.role.deleted',
      metadata: { roleId: input.roleId },
    });
  }

  async grantPermission(input: GrantPermissionInput): Promise<void> {
    assertNonEmptyString(input.roleId, 'roleId');
    normalizePermission(input.permission);
    await this.options.storage.grantPermission(input);
    await this.logAudit({
      type: 'rbac.permission.granted',
      metadata: { roleId: input.roleId, permission: input.permission },
    });
  }

  async revokePermission(input: RevokePermissionInput): Promise<void> {
    assertNonEmptyString(input.roleId, 'roleId');
    normalizePermission(input.permission);
    await this.options.storage.revokePermission(input);
    await this.logAudit({
      type: 'rbac.permission.revoked',
      metadata: { roleId: input.roleId, permission: input.permission },
    });
  }

  async assignRole(input: AssignRoleInput): Promise<RbacRoleBinding> {
    this.validateAssignRoleInput(input);
    const { roleId, roleKey } = await this.resolveAssignRoleIdentifier(input);
    const storageInput: AssignRoleStorageInput = {
      tenantId: input.tenantId,
      subject: input.subject,
      roleId,
      resource: input.resource,
      expiresAt: input.expiresAt,
      metadata: input.metadata,
    };
    const binding = await this.options.storage.assignRole(storageInput);
    await this.logAudit({
      type: 'rbac.role.assigned',
      tenantId: binding.tenantId,
      subjectType: binding.subjectType,
      subjectId: binding.subjectId,
      metadata: {
        bindingId: binding.id,
        roleId: binding.roleId,
        ...(roleKey !== undefined ? { roleKey } : {}),
        ...(input.resource !== undefined ? { resource: auditResource(input.resource) } : {}),
      },
    });

    return binding;
  }

  async revokeRole(input: RevokeRoleInput): Promise<void> {
    assertNonEmptyString(input.bindingId, 'bindingId');
    await this.options.storage.revokeRole(input);
    await this.logAudit({
      type: 'rbac.role.revoked',
      metadata: { bindingId: input.bindingId },
    });
  }

  listRoles(input: ListRolesInput): Promise<RbacRole[]> {
    return this.options.storage.listRoles(input);
  }

  listPermissions(input: ListPermissionsInput): Promise<string[]> {
    return this.options.storage.listRolePermissions(input);
  }

  listBindings(input: ListBindingsInput): Promise<RbacRoleBinding[]> {
    return this.options.storage.listBindings(input);
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

    try {
      const roles = (await this.listEffectiveRolesForTenant(input, subject, tenantId)).filter(
        (role) => matchesResource(role, input.resource),
      );
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

    try {
      const effectivePermissions = (
        await this.listEffectivePermissionsForTenant(input, subject, tenantId)
      ).filter((permission) => matchesResource(permission, input.resource));
      const matches = this.matchPermissions(effectivePermissions, requirement.permissions);
      const allowed =
        requirement.mode === 'all'
          ? requirement.permissions.every((required) => matches.byRequired.has(required))
          : matches.matchedPermissions.length > 0;

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

    if (mode === 'none') {
      return { tenantId: null, missing: false };
    }
    if (input.tenantId === null) {
      return { tenantId: null, missing: mode === 'required' };
    }

    const rawTenantId = input.tenantId !== undefined ? input.tenantId : subject?.tenantId;
    const tenantId = isNonEmptyString(rawTenantId) ? rawTenantId.trim() : null;

    return {
      tenantId,
      missing: mode === 'required' && tenantId === null,
    };
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
        permissions: rawPermissions.filter((candidate): candidate is string => typeof candidate === 'string'),
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
    const hasRoleKey = 'roleKey' in input && typeof input.roleKey === 'string';
    const hasPermission =
      ('permission' in input && input.permission !== undefined) ||
      ('permissions' in input && input.permissions !== undefined);

    if (hasRoleKey && hasPermission) {
      throw new RbacConfigError({
        reason: 'can() accepts exactly one requirement family per call',
      });
    }
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
    if (input.resource !== undefined) {
      assertNonEmptyString(input.resource.type, 'resource.type');
      assertNonEmptyString(input.resource.id, 'resource.id');
    }
  }

  private async resolveAssignRoleIdentifier(
    input: AssignRoleInput,
  ): Promise<{ roleId: string; roleKey?: string | undefined }> {
    if ('roleId' in input && input.roleId !== undefined) {
      return { roleId: input.roleId.trim() };
    }

    const roleKey = input.roleKey.trim();
    const role = await this.options.storage.findRole({
      tenantId: input.tenantId,
      key: roleKey,
    });

    if (role === null) {
      throw new RbacRoleNotFoundError({ tenantId: input.tenantId, roleKey });
    }

    return { roleId: role.id, roleKey };
  }

  private validateSubjectForWrite(subject: RbacSubject): void {
    assertNonEmptyString(subject?.type, 'subject.type');
    assertNonEmptyString(subject?.id, 'subject.id');
    this.validateOptionalTenantId(subject?.tenantId, 'subject.tenantId');
  }

  private validateOptionalTenantId(
    tenantId: string | null | undefined,
    name = 'tenantId',
  ): void {
    if (tenantId !== null && tenantId !== undefined) {
      assertNonEmptyString(tenantId, name);
    }
  }

  private isRoleCheck(input: RbacCanInput): input is RbacCanInput & { roleKey: string } {
    return 'roleKey' in input && typeof input.roleKey === 'string';
  }

  private resolveNow(input: RbacCanInput): Date {
    return input.now ?? this.options.now?.() ?? new Date();
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
    overrides: Partial<RbacDecision> & { allowed: boolean },
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

    return decision;
  }

  private async listEffectiveRolesForTenant(
    input: RbacCanInput,
    subject: RbacSubject,
    tenantId: string | null,
  ): Promise<RbacEffectiveRole[]> {
    const now = this.resolveNow(input);
    const tenantRoles = await this.options.storage.listEffectiveRoles({
      subject,
      tenantId,
      resource: input.resource,
      now,
    });

    if (tenantId === null || this.options.tenant?.allowGlobalRolesInTenant !== true) {
      return tenantRoles;
    }

    const globalRoles = await this.options.storage.listEffectiveRoles({
      subject,
      tenantId: null,
      resource: input.resource,
      now,
    });

    return [...tenantRoles, ...globalRoles];
  }

  private async listEffectivePermissionsForTenant(
    input: RbacCanInput,
    subject: RbacSubject,
    tenantId: string | null,
  ): Promise<RbacEffectivePermission[]> {
    const now = this.resolveNow(input);
    const tenantPermissions = await this.options.storage.listEffectivePermissions({
      subject,
      tenantId,
      resource: input.resource,
      now,
    });

    if (tenantId === null || this.options.tenant?.allowGlobalRolesInTenant !== true) {
      return tenantPermissions;
    }

    const globalPermissions = await this.options.storage.listEffectivePermissions({
      subject,
      tenantId: null,
      resource: input.resource,
      now,
    });

    return [...tenantPermissions, ...globalPermissions];
  }

  private async logAudit(event: RbacAuditEvent): Promise<void> {
    try {
      await this.options.auditLogger?.log(event);
    } catch {
      // Audit logging must not change RBAC write or authorization behavior.
    }
  }
}
