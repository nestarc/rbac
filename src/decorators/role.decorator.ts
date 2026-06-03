import { SetMetadata } from '@nestjs/common';
import { RBAC_REQUIREMENTS_METADATA } from '../constants';
import type { RbacRequirement, RbacRequirementOptions } from '../interfaces';

export const RequireRole = (roleKey: string, options: RbacRequirementOptions = {}) =>
  SetMetadata(RBAC_REQUIREMENTS_METADATA, [
    {
      kind: 'role',
      roleKey,
      options,
    },
  ] satisfies RbacRequirement[]);
