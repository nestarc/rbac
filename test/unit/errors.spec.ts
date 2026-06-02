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
  RbacPermissionNotFoundError,
  RbacResourceMissingError,
  RbacRoleNotFoundError,
  RbacStorageError,
  RbacSubjectMissingError,
  RbacTenantMissingError,
  mapRbacErrorToHttpException,
} from '../../src';
import type {
  ExecutionContext,
  FactoryProvider,
} from '@nestjs/common';
import type {
  AssignRoleInput,
  CreateRoleInput,
  ListEffectiveRolesInput,
  RbacAuditEvent,
  RbacCanInput,
  RbacDecision,
  RbacHeaderResourceDeclaration,
  RbacModuleAsyncOptions,
  RbacModuleOptions,
  RbacParamResourceDeclaration,
  RbacQueryResourceDeclaration,
  RbacRequirementOptions,
  RbacResourceRef,
  RbacResourceResolver,
  RbacResourceResolverFn,
  RbacResourceResolverToken,
  RbacResourceResolverTokenRef,
  RbacStorage,
  RbacSubject,
  RbacSubjectResolver,
  RbacTenantResolver,
  RevokeRoleInput,
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

  it.each([
    [
      new RbacConfigError(),
      InternalServerErrorException,
      { message: 'RBAC configuration error', code: 'RBAC_CONFIG_ERROR' },
    ],
    [
      new RbacSubjectMissingError(),
      UnauthorizedException,
      { message: 'Subject missing', code: 'RBAC_SUBJECT_MISSING' },
    ],
    [
      new RbacTenantMissingError(),
      ForbiddenException,
      { message: 'Tenant missing', code: 'RBAC_TENANT_MISSING' },
    ],
    [
      new RbacResourceMissingError(),
      ForbiddenException,
      { message: 'Resource missing', code: 'RBAC_RESOURCE_MISSING' },
    ],
    [
      new RbacPermissionDeniedError(),
      ForbiddenException,
      { message: 'Permission denied', code: 'RBAC_PERMISSION_DENIED' },
    ],
    [
      new RbacRoleNotFoundError(),
      ForbiddenException,
      { message: 'Role not found', code: 'RBAC_ROLE_NOT_FOUND' },
    ],
    [
      new RbacPermissionNotFoundError(),
      ForbiddenException,
      { message: 'Permission not found', code: 'RBAC_PERMISSION_NOT_FOUND' },
    ],
    [
      new RbacBindingNotFoundError(),
      ForbiddenException,
      { message: 'Binding not found', code: 'RBAC_BINDING_NOT_FOUND' },
    ],
    [
      new RbacStorageError(),
      InternalServerErrorException,
      { message: 'RBAC storage error', code: 'RBAC_STORAGE_ERROR' },
    ],
  ])('maps %s to its explicit HTTP exception response', (error, exception, response) => {
    const httpException = mapRbacErrorToHttpException(error);

    expect(httpException).toBeInstanceOf(exception);
    expect(httpException.getResponse()).toEqual(response);
  });
});

describe('RBAC public interface types', () => {
  it('treats role updates as partial patches keyed by roleId', () => {
    expectTypeOf<UpdateRoleInput>().toMatchTypeOf<{
      roleId: string;
      tenantId?: string | null | undefined;
      key?: string | undefined;
      name?: string | undefined;
      description?: string | undefined;
      isSystem?: boolean | undefined;
      permissions?: string[] | undefined;
    }>();
    expectTypeOf<{ roleId: string }>().toMatchTypeOf<UpdateRoleInput>();
  });

  it('allows function resource resolvers in requirement options', () => {
    expectTypeOf<RbacResourceResolverFn>().toMatchTypeOf<
      NonNullable<RbacRequirementOptions['resource']>
    >();
    expectTypeOf<RbacParamResourceDeclaration>().toMatchTypeOf<
      NonNullable<RbacRequirementOptions['resource']>
    >();
    expectTypeOf<RbacHeaderResourceDeclaration>().toMatchTypeOf<
      NonNullable<RbacRequirementOptions['resource']>
    >();
    expectTypeOf<RbacQueryResourceDeclaration>().toMatchTypeOf<
      NonNullable<RbacRequirementOptions['resource']>
    >();

    const resolverToken: RbacResourceResolverToken = Symbol('ProjectResolver');
    const resolverTokenRef: RbacResourceResolverTokenRef = { resolverToken };
    const requirementOptions: RbacRequirementOptions = { resource: resolverTokenRef };
    const paramResource: RbacRequirementOptions = {
      resource: { type: 'project', idParam: 'projectId' },
    };
    const headerResource: RbacRequirementOptions = {
      resource: { type: 'project', idHeader: 'x-project-id' },
    };
    const queryResource: RbacRequirementOptions = {
      resource: { type: 'project', idQuery: 'projectId' },
    };

    const mixedResourceLiteral = { type: 'project', idParam: 'projectId', idHeader: 'x-project-id' };
    // @ts-expect-error Built-in resource declarations must choose exactly one source.
    const mixedResource: RbacRequirementOptions = { resource: mixedResourceLiteral };

    expect(requirementOptions.resource).toEqual(resolverTokenRef);
    expect(paramResource.resource).toEqual({ type: 'project', idParam: 'projectId' });
    expect(headerResource.resource).toEqual({ type: 'project', idHeader: 'x-project-id' });
    expect(queryResource.resource).toEqual({ type: 'project', idQuery: 'projectId' });

    // @ts-expect-error Bare DI resolver tokens are ambiguous with direct function resolvers.
    const invalidRequirementOptions: RbacRequirementOptions = { resource: resolverToken };

    expect(mixedResource).toBeDefined();
    expect(invalidRequirementOptions).toBeDefined();
  });

  it('matches Nest factory provider typing for async module options', () => {
    expectTypeOf<RbacModuleAsyncOptions['inject']>().toEqualTypeOf<
      FactoryProvider<RbacModuleOptions>['inject']
    >();
    expectTypeOf<RbacModuleAsyncOptions['useFactory']>().toEqualTypeOf<
      FactoryProvider<RbacModuleOptions>['useFactory']
    >();

    const asyncOptions = {
      imports: undefined,
      inject: ['RBAC_STORAGE'],
      useFactory: (storage: RbacModuleOptions['storage']) => ({ storage }),
    } satisfies RbacModuleAsyncOptions;
    const asyncOptionsWithMaybeInject = {
      inject: undefined,
      useFactory: () => ({ storage: {} as RbacModuleOptions['storage'] }),
    } satisfies RbacModuleAsyncOptions;

    expect(asyncOptions.imports).toBeUndefined();
    expect(asyncOptions.inject).toEqual(['RBAC_STORAGE']);
    expect(asyncOptionsWithMaybeInject.inject).toBeUndefined();
  });

  it('allows class resource resolvers to return synchronously', () => {
    class SyncResourceResolver implements RbacResourceResolver {
      resolve(context: ExecutionContext): RbacResourceRef | undefined {
        void context;
        return { type: 'project', id: 'project_1' };
      }
    }

    expect(new SyncResourceResolver().resolve({} as ExecutionContext)).toEqual({
      type: 'project',
      id: 'project_1',
    });

    const resolverToken: RbacResourceResolverToken = Symbol('ProjectResolver');
    const classResolverTokenRef: RbacResourceResolverTokenRef = {
      resolverToken: SyncResourceResolver,
    };
    const classRequirementOptions: RbacRequirementOptions = {
      resource: classResolverTokenRef,
    };

    expect(typeof resolverToken).toBe('symbol');
    expect(classRequirementOptions.resource).toEqual(classResolverTokenRef);
  });

  it('accepts explicit undefined in public pass-through input and option shapes', () => {
    const fakeStorage: RbacStorage = {
      findRole: () => Promise.resolve(null),
      listRoles: () => Promise.resolve([]),
      upsertRole: () =>
        Promise.resolve({
          id: 'role_1',
          key: 'admin',
          permissions: [],
        }),
      deleteRole: () => Promise.resolve(),
      grantPermission: () => Promise.resolve(),
      revokePermission: () => Promise.resolve(),
      listRolePermissions: () => Promise.resolve([]),
      assignRole: () =>
        Promise.resolve({
          id: 'binding_1',
          subjectType: 'user',
          subjectId: 'user_1',
          roleId: 'role_1',
        }),
      revokeRole: () => Promise.resolve(),
      listBindings: () => Promise.resolve([]),
      listEffectiveRoles: () => Promise.resolve([]),
      listEffectivePermissions: () => Promise.resolve([]),
    };
    const subject: RbacSubject = { type: 'user', id: 'user_1' };
    const maybeSubject: RbacSubject | undefined = undefined;
    const maybeSubjectResolver: RbacSubjectResolver | undefined = undefined;
    const maybeTenantResolver: RbacTenantResolver | undefined = undefined;
    const maybeTenantId: string | null | undefined = undefined;
    const maybePermissions: string[] | undefined = undefined;
    const maybeResource: RbacResourceRef | undefined = undefined;
    const maybeResourceDeclaration: NonNullable<RbacRequirementOptions['resource']> | undefined =
      undefined;
    const maybeReason: string | undefined = undefined;
    const maybeNow: Date | undefined = undefined;

    const canInput: RbacCanInput = {
      subject: maybeSubject,
      tenantId: maybeTenantId,
      tenantMode: undefined,
      permission: 'reports.read',
      permissions: maybePermissions,
      mode: undefined,
      resource: maybeResource,
      now: maybeNow,
    };
    const roleCanInput: RbacCanInput = {
      subject: maybeSubject,
      tenantId: maybeTenantId,
      roleKey: 'admin',
      resource: maybeResource,
      now: maybeNow,
    };
    const permissionsCanInput: RbacCanInput = {
      permissions: ['reports.read'],
      mode: 'all',
    };
    // @ts-expect-error A requirement must include a permission family or role family.
    const missingRequirementCanInput: RbacCanInput = { subject: maybeSubject };
    // @ts-expect-error Permission and role requirements are mutually exclusive.
    const mixedRequirementCanInput: RbacCanInput = {
      permission: 'reports.read',
      roleKey: 'admin',
    };
    // @ts-expect-error Role requirements do not use permission aggregation mode.
    const roleModeCanInput: RbacCanInput = { roleKey: 'admin', mode: 'any' };
    const decision: RbacDecision = {
      allowed: false,
      reason: 'denied_subject_missing',
      subject: maybeSubject,
      tenantId: maybeTenantId,
      permission: undefined,
      permissions: maybePermissions,
      roleKey: undefined,
      mode: undefined,
      matchedRoleKeys: undefined,
      matchedPermissions: undefined,
      resource: maybeResource,
    };
    const moduleOptions: RbacModuleOptions = {
      storage: fakeStorage,
      subjectResolver: maybeSubjectResolver,
      tenantResolver: maybeTenantResolver,
      auditLogger: undefined,
      requireMetadata: undefined,
      tenant: {
        requiredByDefault: undefined,
        allowGlobalRolesInTenant: undefined,
      },
      storageErrors: undefined,
      logAllowedDecisions: undefined,
      now: undefined,
    };
    const requirementOptions: RbacRequirementOptions = {
      mode: undefined,
      tenant: undefined,
      resource: maybeResourceDeclaration,
      reason: maybeReason,
    };
    const createRoleInput: CreateRoleInput = {
      tenantId: maybeTenantId,
      key: 'admin',
      name: undefined,
      description: undefined,
      isSystem: undefined,
      permissions: [],
    };
    const updateRoleInput: UpdateRoleInput = {
      roleId: 'role_1',
      tenantId: maybeTenantId,
      key: undefined,
      name: undefined,
      description: undefined,
      isSystem: undefined,
      permissions: undefined,
    };
    const assignRoleInput: AssignRoleInput = {
      tenantId: maybeTenantId,
      subject,
      roleId: 'role_1',
      resource: maybeResource,
      expiresAt: undefined,
      metadata: undefined,
    };
    const revokeRoleInput: RevokeRoleInput = {
      bindingId: 'binding_1',
      revokedAt: undefined,
    };
    const listEffectiveRolesInput: ListEffectiveRolesInput = {
      subject,
      tenantId: maybeTenantId,
      resource: maybeResource,
      now: maybeNow,
    };
    const auditEvent: RbacAuditEvent = {
      type: 'rbac.permission.denied',
      tenantId: maybeTenantId,
      subjectType: undefined,
      subjectId: undefined,
      metadata: undefined,
    };

    expect([
      canInput,
      roleCanInput,
      permissionsCanInput,
      missingRequirementCanInput,
      mixedRequirementCanInput,
      roleModeCanInput,
      decision,
      moduleOptions,
      requirementOptions,
      createRoleInput,
      updateRoleInput,
      assignRoleInput,
      revokeRoleInput,
      listEffectiveRolesInput,
      auditEvent,
    ]).toHaveLength(15);
  });
});
