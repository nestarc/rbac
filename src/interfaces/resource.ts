import type { ExecutionContext, InjectionToken } from '@nestjs/common';

export interface RbacResourceRef {
  type: string;
  id: string;
}

/** Injectable resource resolver used by the HTTP-only `RbacGuard` pipeline in 0.2.x. */
export interface RbacResourceResolver {
  resolve(
    context: ExecutionContext,
  ): Promise<RbacResourceRef | undefined> | RbacResourceRef | undefined;
}

export type RbacResourceResolverToken = InjectionToken<RbacResourceResolver>;

export interface RbacResourceResolverTokenRef {
  resolverToken: RbacResourceResolverToken;
}
