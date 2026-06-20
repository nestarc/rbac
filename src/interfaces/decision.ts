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

export interface RbacDecisionDetails {
  requirement?: RbacDecisionRequirementDetails | undefined;
  matched?: RbacDecisionMatchDetails | undefined;
  missing?: RbacDecisionMissingDetails | undefined;
  evaluationPath?: RbacEvaluationStep[] | undefined;
  safeMessage?: string | undefined;
}

export interface RbacDecisionRequirementDetails {
  type: 'permission' | 'role';
  permissions?: string[] | undefined;
  roleKeys?: string[] | undefined;
  mode?: RbacRequirementMode | undefined;
}

export interface RbacDecisionMatchDetails {
  roleIds?: string[] | undefined;
  roleKeys?: string[] | undefined;
  permissions?: string[] | undefined;
  bindingIds?: string[] | undefined;
}

export interface RbacDecisionMissingDetails {
  subject?: boolean | undefined;
  tenant?: boolean | undefined;
  resource?: boolean | undefined;
  permissions?: string[] | undefined;
  roleKeys?: string[] | undefined;
}

export interface RbacEvaluationStep {
  code:
    | 'subject_missing'
    | 'tenant_missing'
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

export type RbacDecisionReason =
  | 'allowed_by_role'
  | 'allowed_by_role_permission'
  | 'denied_subject_missing'
  | 'denied_tenant_missing'
  | 'denied_resource_missing'
  | 'denied_no_matching_role'
  | 'denied_no_matching_permission'
  | 'denied_role_expired'
  | 'denied_resource_mismatch'
  | 'denied_storage_error';
