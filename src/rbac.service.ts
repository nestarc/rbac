import { Inject, Injectable } from '@nestjs/common';
import { RBAC_OPTIONS } from './constants';
import {
  RbacPermissionDeniedError,
  RbacStorageError,
  RbacSubjectMissingError,
  RbacTenantMissingError,
} from './errors';
import type {
  AssignRoleInput,
  CreateRoleInput,
  DeleteRoleInput,
  GrantPermissionInput,
  ListBindingsInput,
  ListPermissionsInput,
  ListRolesInput,
  RbacCanInput,
  RbacDecision,
  RbacDecisionReason,
  RbacEffectivePermission,
  RbacModuleOptions,
  RbacRequirementMode,
  RbacRole,
  RbacRoleBinding,
  RbacSubject,
  RevokePermissionInput,
  RevokeRoleInput,
  UpdateRoleInput,
} from './interfaces';
import { matchesPermission, matchesResource, normalizePermission, normalizePermissions } from './utils';

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

@Injectable()
export class RbacService {
  constructor(@Inject(RBAC_OPTIONS) private readonly options: RbacModuleOptions) {}

  async can(input: RbacCanInput): Promise<RbacDecision> {
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

  async assertCan(input: RbacCanInput): Promise<RbacDecision> {
    const decision = await this.can(input);

    if (decision.allowed) return decision;

    const details = { decision };
    if (decision.reason === 'denied_subject_missing') {
      throw new RbacSubjectMissingError(details);
    }
    if (decision.reason === 'denied_tenant_missing') {
      throw new RbacTenantMissingError(details);
    }

    throw new RbacPermissionDeniedError(details);
  }

  createRole(input: CreateRoleInput): Promise<RbacRole> {
    return this.options.storage.upsertRole(input);
  }

  updateRole(input: UpdateRoleInput): Promise<RbacRole> {
    return this.options.storage.upsertRole(input);
  }

  deleteRole(input: DeleteRoleInput): Promise<void> {
    return this.options.storage.deleteRole(input);
  }

  grantPermission(input: GrantPermissionInput): Promise<void> {
    return this.options.storage.grantPermission(input);
  }

  revokePermission(input: RevokePermissionInput): Promise<void> {
    return this.options.storage.revokePermission(input);
  }

  assignRole(input: AssignRoleInput): Promise<RbacRoleBinding> {
    return this.options.storage.assignRole(input);
  }

  revokeRole(input: RevokeRoleInput): Promise<void> {
    return this.options.storage.revokeRole(input);
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
      const roles = (await this.options.storage.listEffectiveRoles({
        subject,
        tenantId,
        resource: input.resource,
        now: this.resolveNow(input),
      })).filter((role) => matchesResource(role, input.resource));
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
      const effectivePermissions = (await this.options.storage.listEffectivePermissions({
        subject,
        tenantId,
        resource: input.resource,
        now: this.resolveNow(input),
      })).filter((permission) => matchesResource(permission, input.resource));
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
      return { tenantId: null, missing: false };
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
}
