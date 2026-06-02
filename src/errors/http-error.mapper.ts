import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RbacError } from './rbac.error';

export function mapRbacErrorToHttpException(error: RbacError) {
  const response = { message: error.message, code: error.code };

  switch (error.code) {
    case 'RBAC_SUBJECT_MISSING':
      return new UnauthorizedException(response);
    case 'RBAC_CONFIG_ERROR':
    case 'RBAC_STORAGE_ERROR':
      return new InternalServerErrorException(response);
    default:
      return new ForbiddenException(response);
  }
}
