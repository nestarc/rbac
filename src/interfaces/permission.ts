export interface GrantPermissionInput {
  roleId: string;
  permission: string;
}

export interface RevokePermissionInput {
  roleId: string;
  permission: string;
}

export interface ListPermissionsInput {
  roleId: string;
}

export interface ListRolePermissionsInput {
  roleId: string;
}
