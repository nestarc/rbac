import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RbacError } from './rbac.error';

export function mapRbacErrorToHttpException(error: RbacError) {
  const response = { message: error.message, code: error.code };

  switch (error.code) {
    case 'RBAC_CONFIG_ERROR':
    case 'RBAC_STORAGE_ERROR':
      return new InternalServerErrorException(response);
    case 'RBAC_SUBJECT_MISSING':
      return new UnauthorizedException(response);
    case 'RBAC_TENANT_MISSING':
    case 'RBAC_RESOURCE_MISSING':
    case 'RBAC_PERMISSION_DENIED':
    case 'RBAC_ROLE_NOT_FOUND':
    case 'RBAC_PERMISSION_NOT_FOUND':
    case 'RBAC_BINDING_NOT_FOUND':
      return new ForbiddenException(response);
    default:
      return assertNever(error.code);
  }
}

function assertNever(_code: never): never {
  void _code;
  throw new Error('Unhandled RBAC error code');
}
