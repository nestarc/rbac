export type RbacErrorCode =
  | 'RBAC_CONFIG_ERROR'
  | 'RBAC_SUBJECT_MISSING'
  | 'RBAC_TENANT_MISSING'
  | 'RBAC_RESOURCE_MISSING'
  | 'RBAC_PERMISSION_DENIED'
  | 'RBAC_ROLE_NOT_FOUND'
  | 'RBAC_PERMISSION_NOT_FOUND'
  | 'RBAC_BINDING_NOT_FOUND'
  | 'RBAC_STORAGE_ERROR';

export class RbacError extends Error {
  constructor(
    message: string,
    public readonly code: RbacErrorCode,
    public readonly status?: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class RbacSubjectMissingError extends RbacError {
  constructor(details?: Record<string, unknown>) {
    super('Subject missing', 'RBAC_SUBJECT_MISSING', 401, details);
  }
}

export class RbacTenantMissingError extends RbacError {
  constructor(details?: Record<string, unknown>) {
    super('Tenant missing', 'RBAC_TENANT_MISSING', 403, details);
  }
}

export class RbacResourceMissingError extends RbacError {
  constructor(details?: Record<string, unknown>) {
    super('Resource missing', 'RBAC_RESOURCE_MISSING', 403, details);
  }
}

export class RbacPermissionDeniedError extends RbacError {
  constructor(details?: Record<string, unknown>) {
    super('Permission denied', 'RBAC_PERMISSION_DENIED', 403, details);
  }
}

export class RbacStorageError extends RbacError {
  constructor(details?: Record<string, unknown>) {
    super('RBAC storage error', 'RBAC_STORAGE_ERROR', 500, details);
  }
}
