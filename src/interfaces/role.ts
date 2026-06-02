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
  tenantId?: string | null | undefined;
  key: string;
  name?: string | undefined;
  description?: string | undefined;
  isSystem?: boolean | undefined;
  permissions: string[];
}

export interface UpdateRoleInput {
  roleId: string;
  tenantId?: string | null | undefined;
  key?: string | undefined;
  name?: string | undefined;
  description?: string | undefined;
  isSystem?: boolean | undefined;
  permissions?: string[] | undefined;
}

export interface DeleteRoleInput {
  roleId: string;
}

export interface ListRolesInput {
  tenantId?: string | null | undefined;
}

export interface FindRoleInput {
  tenantId?: string | null | undefined;
  key: string;
}

export type UpsertRoleInput = CreateRoleInput | UpdateRoleInput;
