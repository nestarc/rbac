import type { RbacResourceRef } from './resource';
import type { RbacSubject } from './subject';

export type RbacTenantMode = 'required' | 'optional' | 'none';
export type RbacRequirementMode = 'any' | 'all';

export interface RbacCanInput {
  subject?: RbacSubject | undefined;
  tenantId?: string | null | undefined;
  tenantMode?: RbacTenantMode | undefined;
  permission?: string | undefined;
  permissions?: string[] | undefined;
  roleKey?: string | undefined;
  mode?: RbacRequirementMode | undefined;
  resource?: RbacResourceRef | undefined;
  now?: Date | undefined;
}

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
