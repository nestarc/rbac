import { RbacConfigError } from '../errors';
import type {
  RbacBuiltInResourceDeclaration,
  RbacCanInput,
  RbacRequirement,
  RbacRequirementMode,
  RbacResourceRef,
  RbacSubject,
  RbacTenantMode,
} from '../interfaces';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const isRequirementMode = (value: unknown): value is RbacRequirementMode =>
  value === 'any' || value === 'all';

const isTenantMode = (value: unknown): value is RbacTenantMode =>
  value === 'required' || value === 'optional' || value === 'none';

const fail = (operation: 'can' | 'guard' | 'assignRole' | 'revokeRole', field: string): never => {
  throw new RbacConfigError({ operation, field, reason: 'invalid_runtime_shape' });
};

export const isFiniteDate = (value: unknown): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

export const isRbacSubject = (value: unknown): value is RbacSubject =>
  isRecord(value) &&
  isNonEmptyString(value.type) &&
  isNonEmptyString(value.id) &&
  (value.tenantId === undefined || value.tenantId === null || isNonEmptyString(value.tenantId));

export const isRbacResourceRef = (value: unknown): value is RbacResourceRef =>
  isRecord(value) && isNonEmptyString(value.type) && isNonEmptyString(value.id);

export function assertFiniteDate(
  value: unknown,
  operation: 'can' | 'assignRole' | 'revokeRole',
  field: string,
): asserts value is Date {
  if (!isFiniteDate(value)) fail(operation, field);
}

export function assertCanInput(value: unknown): asserts value is RbacCanInput {
  const input = isRecord(value) ? value : fail('can', 'input');

  if (input.subject !== undefined && !isRbacSubject(input.subject)) {
    fail('can', 'subject');
  }
  if (
    input.tenantId !== undefined &&
    input.tenantId !== null &&
    !isNonEmptyString(input.tenantId)
  ) {
    fail('can', 'tenantId');
  }
  if (input.tenantMode !== undefined && !isTenantMode(input.tenantMode)) {
    fail('can', 'tenantMode');
  }
  if (input.resource !== undefined && !isRbacResourceRef(input.resource)) {
    fail('can', 'resource');
  }
  if (input.now !== undefined) {
    assertFiniteDate(input.now, 'can', 'now');
  }

  const hasRole = input.roleKey !== undefined;
  const hasPermission = input.permission !== undefined || input.permissions !== undefined;
  if (hasRole && hasPermission) {
    throw new RbacConfigError({
      reason: 'can() accepts exactly one requirement family per call',
    });
  }
  if (!hasRole && !hasPermission) fail('can', 'requirement');

  if (hasRole) {
    if (!isNonEmptyString(input.roleKey)) fail('can', 'roleKey');
    if (input.mode !== undefined) fail('can', 'mode');
    return;
  }

  if (input.permission !== undefined && !isNonEmptyString(input.permission)) {
    fail('can', 'permission');
  }
  if (
    input.permissions !== undefined &&
    (!Array.isArray(input.permissions) ||
      input.permissions.some((permission: unknown) => !isNonEmptyString(permission)))
  ) {
    fail('can', 'permissions');
  }
  if (input.mode !== undefined && !isRequirementMode(input.mode)) {
    fail('can', 'mode');
  }
}

const isResolverToken = (value: unknown): boolean =>
  isNonEmptyString(value) || typeof value === 'symbol' || typeof value === 'function';

const isBuiltInResourceDeclaration = (
  value: Record<string, unknown>,
): value is RbacBuiltInResourceDeclaration => {
  const selectorKeys = ['idParam', 'idHeader', 'idQuery'].filter((key) => key in value);

  return (
    isNonEmptyString(value.type) &&
    selectorKeys.length === 1 &&
    isNonEmptyString(value[selectorKeys[0] as string])
  );
};

const isRequirementResource = (value: unknown): boolean => {
  if (isResolverToken(value)) return true;
  if (!isRecord(value)) return false;
  if ('resolverToken' in value) return isResolverToken(value.resolverToken);

  return isBuiltInResourceDeclaration(value);
};

const assertRequirement = (value: unknown, index: number): asserts value is RbacRequirement => {
  const field = `requirements[${index}]`;
  const requirement = isRecord(value) ? value : fail('guard', field);
  const options = isRecord(requirement.options)
    ? requirement.options
    : fail('guard', `${field}.options`);

  if (options.mode !== undefined && !isRequirementMode(options.mode)) {
    fail('guard', `${field}.options.mode`);
  }
  if (options.tenant !== undefined && !isTenantMode(options.tenant)) {
    fail('guard', `${field}.options.tenant`);
  }
  if (options.resource !== undefined && !isRequirementResource(options.resource)) {
    fail('guard', `${field}.options.resource`);
  }
  if (options.reason !== undefined && typeof options.reason !== 'string') {
    fail('guard', `${field}.options.reason`);
  }

  if (requirement.kind === 'role') {
    if (!isNonEmptyString(requirement.roleKey)) fail('guard', `${field}.roleKey`);
    return;
  }
  if (requirement.kind !== 'permission') fail('guard', `${field}.kind`);
  if (
    !Array.isArray(requirement.permissions) ||
    requirement.permissions.length === 0 ||
    requirement.permissions.some((permission: unknown) => !isNonEmptyString(permission))
  ) {
    fail('guard', `${field}.permissions`);
  }
  if (!isRequirementMode(requirement.mode)) fail('guard', `${field}.mode`);
  if (options.mode !== undefined && options.mode !== requirement.mode) {
    fail('guard', `${field}.mode`);
  }
};

export function assertRbacRequirements(value: unknown): asserts value is RbacRequirement[] {
  const requirements = Array.isArray(value) ? value : fail('guard', 'requirements');
  requirements.forEach((requirement: unknown, index: number) =>
    assertRequirement(requirement, index),
  );
}
