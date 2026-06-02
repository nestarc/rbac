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
