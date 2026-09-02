import type { RbacRequirementMode } from './decision';
import type { RbacResourceResolverFn } from './resolvers';
import type { RbacResourceResolverToken, RbacResourceResolverTokenRef } from './resource';

export type RbacParamResourceDeclaration = {
  type: string;
  idParam: string;
  idHeader?: never;
  idQuery?: never;
};

export type RbacHeaderResourceDeclaration = {
  type: string;
  idHeader: string;
  idParam?: never;
  idQuery?: never;
};

export type RbacQueryResourceDeclaration = {
  type: string;
  idQuery: string;
  idParam?: never;
  idHeader?: never;
};

export type RbacBuiltInResourceDeclaration =
  | RbacParamResourceDeclaration
  | RbacHeaderResourceDeclaration
  | RbacQueryResourceDeclaration;

export interface RbacRequirementOptions {
  mode?: RbacRequirementMode | undefined;
  tenant?: 'required' | 'optional' | 'none' | undefined;
  resource?:
    | RbacBuiltInResourceDeclaration
    | RbacResourceResolverFn
    | RbacResourceResolverToken
    | RbacResourceResolverTokenRef
    | undefined;
  /**
   * @deprecated Stored in decorator metadata for compatibility but never read,
   * returned in a decision, or written to RBAC audit events. Use application-owned
   * metadata for human-readable policy labels.
   */
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
