import type { ExecutionContext, InjectionToken } from '@nestjs/common';

export interface RbacResourceRef {
  type: string;
  id: string;
}

export interface RbacResourceResolver {
  resolve(context: ExecutionContext): Promise<RbacResourceRef | undefined> | RbacResourceRef | undefined;
}

export type RbacResourceResolverToken = InjectionToken<RbacResourceResolver>;

export interface RbacResourceResolverTokenRef {
  resolverToken: RbacResourceResolverToken;
}
