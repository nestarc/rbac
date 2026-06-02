import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RbacError } from './rbac.error';

export function mapRbacErrorToHttpException(error: RbacError) {
  const response = { message: error.message, code: error.code };

  if (error.code === 'RBAC_SUBJECT_MISSING') {
    return new UnauthorizedException(response);
  }

  if (error.code === 'RBAC_STORAGE_ERROR') {
    return new InternalServerErrorException(response);
  }

  return new ForbiddenException(response);
}
