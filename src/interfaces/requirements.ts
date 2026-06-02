import type { RbacRequirementMode } from './decision';
import type { RbacResourceResolverFn } from './resolvers';
import type { RbacResourceResolverTokenRef } from './resource';

export interface RbacRequirementOptions {
  mode?: RbacRequirementMode | undefined;
  tenant?: 'required' | 'optional' | 'none' | undefined;
  resource?:
    | { type: string; idParam: string }
    | { type: string; idHeader: string }
    | { type: string; idQuery: string }
    | RbacResourceResolverFn
    | RbacResourceResolverTokenRef
    | undefined;
  reason?: string | undefined;
}

export type RbacRequirement =
  | {
      kind: 'permission';
      permissions: string[];
      mode: RbacRequirementMode;
      options: RbacRequirementOptions;
    }
  | {
      kind: 'role';
      roleKey: string;
      options: RbacRequirementOptions;
    };
