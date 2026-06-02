export interface RbacResourceRef {
  type: string;
  id: string;
}

export interface RbacResourceResolver {
  resolve(context: import('@nestjs/common').ExecutionContext): Promise<RbacResourceRef | undefined>;
}

export type RbacResourceResolverToken = new (...args: never[]) => RbacResourceResolver;
