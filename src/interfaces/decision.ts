import type { RbacResourceRef } from './resource';
import type { RbacSubject } from './subject';

export type RbacTenantMode = 'required' | 'optional' | 'none';
export type RbacRequirementMode = 'any' | 'all';

export interface RbacCanBaseInput {
  subject?: RbacSubject | undefined;
  tenantId?: string | null | undefined;
  tenantMode?: RbacTenantMode | undefined;
  resource?: RbacResourceRef | undefined;
  now?: Date | undefined;
}

export type RbacPermissionCanInput = RbacCanBaseInput &
  (
    | {
        permission: string;
        permissions?: string[] | undefined;
        roleKey?: never;
        mode?: RbacRequirementMode | undefined;
      }
    | {
        permission?: undefined;
        permissions: string[];
        roleKey?: never;
        mode?: RbacRequirementMode | undefined;
      }
  );

export type RbacRoleCanInput = RbacCanBaseInput & {
  roleKey: string;
  permission?: never;
  permissions?: never;
  mode?: never;
};

export type RbacCanInput = RbacPermissionCanInput | RbacRoleCanInput;

/**
 * Compatibility envelope for decisions created by applications, tests, or older
 * package versions. `RbacService.can()` returns the narrower
 * `RbacServiceDecision` contract.
 */
export interface RbacDecision {
  allowed: boolean;
  reason: RbacDecisionReason;
  subject?: RbacSubject | undefined;
  tenantId?: string | null | undefined;
  permission?: string | undefined;
  permissions?: string[] | undefined;
  roleKey?: string | undefined;
  mode?: RbacRequirementMode | undefined;
  matchedRoleKeys?: string[] | undefined;
  matchedPermissions?: string[] | undefined;
  resource?: RbacResourceRef | undefined;
  details?: RbacDecisionDetails | undefined;
}

/** A decision produced by `RbacService.can()`. */
export type RbacServiceDecision = Omit<RbacDecision, 'reason' | 'details'> & {
  reason: RbacServiceDecisionReason;
  details: RbacServiceDecisionDetails;
};

export interface RbacDecisionDetails {
  requirement?: RbacDecisionRequirementDetails | undefined;
  matched?: RbacDecisionMatchDetails | undefined;
  missing?: RbacDecisionMissingDetails | undefined;
  evaluationPath?: RbacEvaluationStep[] | undefined;
  safeMessage?: string | undefined;
}

/** Details that are always attached to decisions produced by `RbacService.can()`. */
export interface RbacServiceDecisionDetails extends Omit<
  RbacDecisionDetails,
  'requirement' | 'matched' | 'missing' | 'evaluationPath' | 'safeMessage'
> {
  requirement?: RbacServiceDecisionRequirementDetails | undefined;
  matched?: RbacServiceDecisionMatchDetails | undefined;
  missing?: RbacServiceDecisionMissingDetails | undefined;
  evaluationPath: RbacServiceEvaluationStep[];
  safeMessage: RbacServiceDecisionReason;
}

export type RbacServiceDecisionRequirementDetails =
  | {
      type: 'permission';
      permissions: string[];
      mode: RbacRequirementMode;
    }
  | {
      type: 'role';
      roleKeys: string[];
    };

export interface RbacServiceDecisionMatchDetails {
  roleKeys: string[];
  permissions?: string[] | undefined;
}

export type RbacServiceDecisionMissingDetails =
  | { subject: true }
  | { tenant: true }
  | { permissions: string[] }
  | { roleKeys: string[] };

export interface RbacDecisionRequirementDetails {
  type: 'permission' | 'role';
  permissions?: string[] | undefined;
  roleKeys?: string[] | undefined;
  mode?: RbacRequirementMode | undefined;
}

export interface RbacDecisionMatchDetails {
  /** @deprecated `RbacService` has never populated this compatibility field. */
  roleIds?: string[] | undefined;
  roleKeys?: string[] | undefined;
  permissions?: string[] | undefined;
  /** @deprecated `RbacService` has never populated this compatibility field. */
  bindingIds?: string[] | undefined;
}

export interface RbacDecisionMissingDetails {
  subject?: boolean | undefined;
  tenant?: boolean | undefined;
  /** @deprecated `RbacService` reports resource failures before creating a decision. */
  resource?: boolean | undefined;
  permissions?: string[] | undefined;
  roleKeys?: string[] | undefined;
}

export interface RbacEvaluationStep {
  code:
    | 'subject_missing'
    | 'tenant_missing'
    | 'tenant_conflict'
    | 'resource_missing'
    | 'resource_mismatch'
    | 'roles_loaded'
    | 'permissions_loaded'
    | 'permission_matched'
    | 'permission_missing'
    | 'role_matched'
    | 'role_missing'
    | 'storage_error';
  outcome: 'allow' | 'deny' | 'skip' | 'info';
}

/** Evaluation steps that `RbacService.can()` can currently produce. */
export type RbacServiceEvaluationStep =
  | {
      code: 'role_matched' | 'permission_matched';
      outcome: 'allow';
    }
  | {
      code:
        | 'subject_missing'
        | 'tenant_missing'
        | 'tenant_conflict'
        | 'permission_missing'
        | 'role_missing'
        | 'storage_error';
      outcome: 'deny';
    };

/** Decision reasons that `RbacService.can()` can currently produce. */
export type RbacServiceDecisionReason =
  | 'allowed_by_role'
  | 'allowed_by_role_permission'
  | 'denied_subject_missing'
  | 'denied_tenant_missing'
  | 'denied_tenant_conflict'
  | 'denied_no_matching_role'
  | 'denied_no_matching_permission'
  | 'denied_storage_error';

/**
 * @deprecated These values were exported by 0.2.x but have no
 * `RbacService.can()` producer. They remain in the compatibility
 * `RbacDecisionReason` envelope until a separate breaking release.
 */
export type RbacLegacyDecisionReason =
  | 'denied_resource_missing'
  | 'denied_role_expired'
  | 'denied_resource_mismatch';

/**
 * Compatibility reason union. Prefer `RbacServiceDecisionReason` when consuming
 * results returned by `RbacService.can()`.
 */
export type RbacDecisionReason = RbacServiceDecisionReason | RbacLegacyDecisionReason;
