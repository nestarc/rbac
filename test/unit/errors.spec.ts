import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  RbacPermissionDeniedError,
  RbacStorageError,
  RbacSubjectMissingError,
  mapRbacErrorToHttpException,
} from '../../src';

describe('RBAC errors', () => {
  it('stores stable codes and safe details', () => {
    const error = new RbacPermissionDeniedError({ permission: 'reports.write' });

    expect(error.code).toBe('RBAC_PERMISSION_DENIED');
    expect(error.message).toBe('Permission denied');
    expect(error.details).toEqual({ permission: 'reports.write' });
  });

  it('maps subject missing to UnauthorizedException', () => {
    expect(mapRbacErrorToHttpException(new RbacSubjectMissingError())).toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('maps permission denied to ForbiddenException', () => {
    expect(mapRbacErrorToHttpException(new RbacPermissionDeniedError())).toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('maps storage errors to InternalServerErrorException', () => {
    expect(mapRbacErrorToHttpException(new RbacStorageError())).toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
