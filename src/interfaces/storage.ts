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
  RbacRole,
  UpsertRoleInput,
} from './role';
import type { RbacSubject } from './subject';

export interface ListEffectiveRolesInput {
  subject: RbacSubject;
  tenantId?: string | null;
  resource?: RbacResourceRef;
  now?: Date;
}

export type ListEffectivePermissionsInput = ListEffectiveRolesInput;

export interface RbacEffectiveRole {
  roleKey: string;
  roleId: string;
  bindingId: string;
  tenantId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  expiresAt?: Date | null;
}

export interface RbacEffectivePermission extends RbacEffectiveRole {
  permission: string;
}

export interface RbacStorage {
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
  listEffectivePermissions(input: ListEffectivePermissionsInput): Promise<RbacEffectivePermission[]>;
}
