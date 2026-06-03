import type { RbacTenantResolver } from '../interfaces';

export type RbacTenantIdGetter = () => string | null | undefined;

export function createTenancyTenantResolver(getTenantId: RbacTenantIdGetter): RbacTenantResolver {
  return () => getTenantId();
}
