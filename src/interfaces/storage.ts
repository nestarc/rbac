import type {
  AssignRoleStorageInput,
  ListBindingsStorageInput,
  RbacRoleBinding,
  RevokeRoleStorageInput,
} from './binding';
import type {
  GrantPermissionInput,
  ListRolePermissionsInput,
  RevokePermissionInput,
} from './permission';
import type { RbacResourceRef } from './resource';
import type {
  DeleteRoleInput,
  FindRoleInput,
  ListRolesInput,
  CreateRoleInput,
  RbacRole,
  UpdateRoleInput,
  UpsertRoleInput,
} from './role';
import type { RbacSubject } from './subject';

export interface ListEffectiveRolesInput {
  subject: RbacSubject;
  tenantId?: string | null | undefined;
  resource?: RbacResourceRef | undefined;
  now?: Date | undefined;
}

export type ListEffectivePermissionsInput = ListEffectiveRolesInput;

export interface RbacEffectiveRole {
  roleKey: string;
  roleId: string;
  bindingId: string;
  /** `null` and `undefined` both identify a global effective record. */
  tenantId?: string | null | undefined;
  /** Resource scope is either an absent pair or two populated strings. */
  resourceType?: string | null;
  resourceId?: string | null;
  /** The record remains active when `expiresAt` is exactly equal to the query `now`. */
  expiresAt?: Date | null;
}

export interface RbacEffectivePermission extends RbacEffectiveRole {
  permission: string;
}

export type RbacMutationOutcome = 'created' | 'updated' | 'deleted' | 'no-op' | 'conflict';

export type RbacMutationConflictReason = 'role_not_found' | 'duplicate';

export interface RbacMutationResult<T = undefined> {
  outcome: RbacMutationOutcome;
  value?: T | undefined;
  reason?: RbacMutationConflictReason | undefined;
}

/**
 * Optional mutation-result protocol used to distinguish committed changes from
 * idempotent no-ops without changing the legacy RbacStorage method signatures.
 */
export interface RbacStorageMutationCapability {
  createRole(input: CreateRoleInput): Promise<RbacMutationResult<RbacRole>>;
  updateRole(input: UpdateRoleInput): Promise<RbacMutationResult<RbacRole>>;
  deleteRole(input: DeleteRoleInput): Promise<RbacMutationResult>;
  grantPermission(input: GrantPermissionInput): Promise<RbacMutationResult>;
  revokePermission(input: RevokePermissionInput): Promise<RbacMutationResult>;
  assignRole(input: AssignRoleStorageInput): Promise<RbacMutationResult<RbacRoleBinding>>;
  revokeRole(input: RevokeRoleStorageInput): Promise<RbacMutationResult>;
}

export interface RbacStorage {
  /**
   * Additive 0.2.x capability for outcome-aware writes. Custom adapters that
   * omit it use the deprecated result-less best-effort event fallback.
   */
  readonly mutationResults?: RbacStorageMutationCapability | undefined;
  findRole(input: FindRoleInput): Promise<RbacRole | null>;
  listRoles(input: ListRolesInput): Promise<RbacRole[]>;
  upsertRole(input: UpsertRoleInput): Promise<RbacRole>;
  deleteRole(input: DeleteRoleInput): Promise<void>;
  grantPermission(input: GrantPermissionInput): Promise<void>;
  revokePermission(input: RevokePermissionInput): Promise<void>;
  listRolePermissions(input: ListRolePermissionsInput): Promise<string[]>;
  assignRole(input: AssignRoleStorageInput): Promise<RbacRoleBinding>;
  revokeRole(input: RevokeRoleStorageInput): Promise<void>;
  listBindings(input: ListBindingsStorageInput): Promise<RbacRoleBinding[]>;
  listEffectiveRoles(input: ListEffectiveRolesInput): Promise<RbacEffectiveRole[]>;
  listEffectivePermissions(
    input: ListEffectivePermissionsInput,
  ): Promise<RbacEffectivePermission[]>;
}
