import type { RbacRequirementMode } from './decision';
import type { RbacResourceResolverToken } from './resource';

export interface RbacRequirementOptions {
  mode?: RbacRequirementMode;
  tenant?: 'required' | 'optional' | 'none';
  resource?:
    | { type: string; idParam: string }
    | { type: string; idHeader: string }
    | { type: string; idQuery: string }
    | RbacResourceResolverToken;
  reason?: string;
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
