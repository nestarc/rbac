import { appendRbacRequirementMetadata } from './requirement-metadata.decorator';
import type { RbacRequirement, RbacRequirementOptions } from '../interfaces';

export const RequireRole = (roleKey: string, options: RbacRequirementOptions = {}) =>
  appendRbacRequirementMetadata({
    kind: 'role',
    roleKey,
    options: { ...options },
  } satisfies RbacRequirement);
