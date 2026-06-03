import { appendRbacRequirementMetadata } from './requirement-metadata.decorator';
import type { RbacRequirement, RbacRequirementOptions } from '../interfaces';

export const Can = (permission: string, options: RbacRequirementOptions = {}) => {
  const copiedOptions = { ...options };

  return appendRbacRequirementMetadata({
    kind: 'permission',
    permissions: [permission],
    mode: copiedOptions.mode ?? 'any',
    options: copiedOptions,
  } satisfies RbacRequirement);
};

export const RequirePermission = Can;

export const RequirePermissions = (
  permissions: readonly string[],
  options: RbacRequirementOptions = {},
) => {
  const copiedOptions = { ...options };

  return appendRbacRequirementMetadata({
    kind: 'permission',
    permissions: [...permissions],
    mode: copiedOptions.mode ?? 'all',
    options: copiedOptions,
  } satisfies RbacRequirement);
};
