export interface RbacRole {
  id: string;
  key: string;
  name?: string;
  description?: string;
  tenantId?: string | null;
  isSystem?: boolean;
  permissions: string[];
}

export interface CreateRoleInput {
  tenantId?: string | null;
  key: string;
  name?: string;
  description?: string;
  isSystem?: boolean;
  permissions: string[];
}

export interface UpdateRoleInput {
  roleId: string;
  tenantId?: string | null;
  key?: string;
  name?: string;
  description?: string;
  isSystem?: boolean;
  permissions?: string[];
}

export interface DeleteRoleInput {
  roleId: string;
}

export interface ListRolesInput {
  tenantId?: string | null;
}

export interface FindRoleInput {
  tenantId?: string | null;
  key: string;
}

export type UpsertRoleInput = CreateRoleInput | UpdateRoleInput;
