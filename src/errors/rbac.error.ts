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
  details?: Record<string, unknown> | undefined;
  cause?: unknown;
}

export interface RbacErrorCauseOptions {
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
  constructor(details?: Record<string, unknown>, options: RbacErrorCauseOptions = {}) {
    super('RBAC configuration error', 'RBAC_CONFIG_ERROR', 500, {
      details,
      cause: options.cause,
    });
  }
}

export class RbacSubjectMissingError extends RbacError {
  constructor(details?: Record<string, unknown>, options: RbacErrorCauseOptions = {}) {
    super('Subject missing', 'RBAC_SUBJECT_MISSING', 401, { details, cause: options.cause });
  }
}

export class RbacTenantMissingError extends RbacError {
  constructor(details?: Record<string, unknown>, options: RbacErrorCauseOptions = {}) {
    super('Tenant missing', 'RBAC_TENANT_MISSING', 403, { details, cause: options.cause });
  }
}

export class RbacResourceMissingError extends RbacError {
  constructor(details?: Record<string, unknown>, options: RbacErrorCauseOptions = {}) {
    super('Resource missing', 'RBAC_RESOURCE_MISSING', 403, { details, cause: options.cause });
  }
}

export class RbacPermissionDeniedError extends RbacError {
  constructor(details?: Record<string, unknown>, options: RbacErrorCauseOptions = {}) {
    super('Permission denied', 'RBAC_PERMISSION_DENIED', 403, {
      details,
      cause: options.cause,
    });
  }
}

export class RbacRoleNotFoundError extends RbacError {
  constructor(details?: Record<string, unknown>, options: RbacErrorCauseOptions = {}) {
    super('Role not found', 'RBAC_ROLE_NOT_FOUND', 403, { details, cause: options.cause });
  }
}

export class RbacPermissionNotFoundError extends RbacError {
  constructor(details?: Record<string, unknown>, options: RbacErrorCauseOptions = {}) {
    super('Permission not found', 'RBAC_PERMISSION_NOT_FOUND', 403, {
      details,
      cause: options.cause,
    });
  }
}

export class RbacBindingNotFoundError extends RbacError {
  constructor(details?: Record<string, unknown>, options: RbacErrorCauseOptions = {}) {
    super('Binding not found', 'RBAC_BINDING_NOT_FOUND', 403, { details, cause: options.cause });
  }
}

export class RbacStorageError extends RbacError {
  constructor(details?: Record<string, unknown>, options: RbacErrorCauseOptions = {}) {
    super('RBAC storage error', 'RBAC_STORAGE_ERROR', 500, { details, cause: options.cause });
  }
}
