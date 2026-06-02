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

export interface RbacErrorOptions {
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class RbacError extends Error {
  constructor(
    message: string,
    public readonly code: RbacErrorCode,
    public readonly status?: number,
    options: RbacErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }

  public readonly details?: Record<string, unknown>;
}

export class RbacConfigError extends RbacError {
  constructor(options: RbacErrorOptions = {}) {
    super('RBAC configuration error', 'RBAC_CONFIG_ERROR', 500, options);
  }
}

export class RbacSubjectMissingError extends RbacError {
  constructor(options: RbacErrorOptions = {}) {
    super('Subject missing', 'RBAC_SUBJECT_MISSING', 401, options);
  }
}

export class RbacTenantMissingError extends RbacError {
  constructor(options: RbacErrorOptions = {}) {
    super('Tenant missing', 'RBAC_TENANT_MISSING', 403, options);
  }
}

export class RbacResourceMissingError extends RbacError {
  constructor(options: RbacErrorOptions = {}) {
    super('Resource missing', 'RBAC_RESOURCE_MISSING', 403, options);
  }
}

export class RbacPermissionDeniedError extends RbacError {
  constructor(options: RbacErrorOptions = {}) {
    super('Permission denied', 'RBAC_PERMISSION_DENIED', 403, options);
  }
}

export class RbacRoleNotFoundError extends RbacError {
  constructor(options: RbacErrorOptions = {}) {
    super('Role not found', 'RBAC_ROLE_NOT_FOUND', 403, options);
  }
}

export class RbacPermissionNotFoundError extends RbacError {
  constructor(options: RbacErrorOptions = {}) {
    super('Permission not found', 'RBAC_PERMISSION_NOT_FOUND', 403, options);
  }
}

export class RbacBindingNotFoundError extends RbacError {
  constructor(options: RbacErrorOptions = {}) {
    super('Binding not found', 'RBAC_BINDING_NOT_FOUND', 403, options);
  }
}

export class RbacStorageError extends RbacError {
  constructor(options: RbacErrorOptions = {}) {
    super('RBAC storage error', 'RBAC_STORAGE_ERROR', 500, options);
  }
}
