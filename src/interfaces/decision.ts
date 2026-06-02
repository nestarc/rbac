import type { RbacResourceRef } from './resource';
import type { RbacSubject } from './subject';

export type RbacTenantMode = 'required' | 'optional' | 'none';
export type RbacRequirementMode = 'any' | 'all';

export interface RbacCanInput {
  subject?: RbacSubject;
  tenantId?: string | null;
  tenantMode?: RbacTenantMode;
  permission?: string;
  permissions?: string[];
  roleKey?: string;
  mode?: RbacRequirementMode;
  resource?: RbacResourceRef;
  now?: Date;
}

export interface RbacDecision {
  allowed: boolean;
  reason: RbacDecisionReason;
  subject?: RbacSubject;
  tenantId?: string | null;
  permission?: string;
  permissions?: string[];
  roleKey?: string;
  mode?: RbacRequirementMode;
  matchedRoleKeys?: string[];
  matchedPermissions?: string[];
  resource?: RbacResourceRef;
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
