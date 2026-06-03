import { SetMetadata } from '@nestjs/common';
import { RBAC_REQUIREMENTS_METADATA } from '../constants';
import type { RbacRequirement, RbacRequirementOptions } from '../interfaces';

export const Can = (permission: string, options: RbacRequirementOptions = {}) =>
  SetMetadata(RBAC_REQUIREMENTS_METADATA, [
    {
      kind: 'permission',
      permissions: [permission],
      mode: options.mode ?? 'any',
      options,
    },
  ] satisfies RbacRequirement[]);

export const RequirePermission = Can;

export const RequirePermissions = (
  permissions: string[],
  options: RbacRequirementOptions = {},
) =>
  SetMetadata(RBAC_REQUIREMENTS_METADATA, [
    {
      kind: 'permission',
      permissions,
      mode: options.mode ?? 'all',
      options,
    },
  ] satisfies RbacRequirement[]);
