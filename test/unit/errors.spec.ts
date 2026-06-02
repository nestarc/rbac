import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  RbacBindingNotFoundError,
  RbacConfigError,
  RbacError,
  RbacPermissionDeniedError,
  RbacRoleNotFoundError,
  RbacStorageError,
  RbacSubjectMissingError,
  mapRbacErrorToHttpException,
} from '../../src';
import type {
  RbacRequirementOptions,
  RbacResourceResolverFn,
  UpdateRoleInput,
} from '../../src';

describe('RBAC errors', () => {
  it('stores stable codes, names, and direct safe details', () => {
    const error = new RbacPermissionDeniedError({ permission: 'reports.write' });

    expect(error).toBeInstanceOf(RbacError);
    expect(error).toBeInstanceOf(RbacPermissionDeniedError);
    expect(error.name).toBe('RbacPermissionDeniedError');
    expect(error.code).toBe('RBAC_PERMISSION_DENIED');
    expect(error.message).toBe('Permission denied');
    expect(error.details).toEqual({ permission: 'reports.write' });
  });

  it('supports native causes without mixing them into details', () => {
    const cause = new Error('database timeout');
    const baseError = new RbacError('Configuration error', 'RBAC_CONFIG_ERROR', 500, {
      cause,
      details: { option: 'storage' },
    });
    const error = new RbacStorageError({ operation: 'list' }, { cause });

    expect(baseError).toBeInstanceOf(Error);
    expect(baseError.name).toBe('RbacError');
    expect(baseError.cause).toBe(cause);
    expect(baseError.details).toEqual({ option: 'storage' });
    expect(error).toBeInstanceOf(RbacError);
    expect(error).toBeInstanceOf(RbacStorageError);
    expect(error.name).toBe('RbacStorageError');
    expect(error.cause).toBe(cause);
    expect(error.code).toBe('RBAC_STORAGE_ERROR');
    expect(error.message).toBe('RBAC storage error');
    expect(error.details).toEqual({ operation: 'list' });
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

  it('maps config errors to InternalServerErrorException', () => {
    expect(mapRbacErrorToHttpException(new RbacConfigError())).toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('maps not found errors to ForbiddenException', () => {
    expect(mapRbacErrorToHttpException(new RbacRoleNotFoundError())).toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('serializes only safe message and code in HTTP responses', () => {
    const exception = mapRbacErrorToHttpException(
      new RbacBindingNotFoundError(
        { bindingId: 'binding_1', secret: 'do-not-serialize' },
        { cause: new Error('connection string leaked') },
      ),
    );

    expect(exception.getResponse()).toEqual({
      message: 'Binding not found',
      code: 'RBAC_BINDING_NOT_FOUND',
    });
    expect(exception.getResponse()).not.toHaveProperty('details');
    expect(exception.getResponse()).not.toHaveProperty('cause');
    expect(JSON.stringify(exception.getResponse())).not.toContain('do-not-serialize');
    expect(JSON.stringify(exception.getResponse())).not.toContain('connection string leaked');
  });
});

describe('RBAC public interface types', () => {
  it('treats role updates as partial patches keyed by roleId', () => {
    expectTypeOf<UpdateRoleInput>().toMatchTypeOf<{
      roleId: string;
      tenantId?: string | null;
      key?: string;
      name?: string;
      description?: string;
      isSystem?: boolean;
      permissions?: string[];
    }>();
    expectTypeOf<{ roleId: string }>().toMatchTypeOf<UpdateRoleInput>();
  });

  it('allows function resource resolvers in requirement options', () => {
    expectTypeOf<RbacResourceResolverFn>().toMatchTypeOf<
      NonNullable<RbacRequirementOptions['resource']>
    >();
  });
});
