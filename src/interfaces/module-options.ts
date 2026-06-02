import type { ModuleMetadata } from '@nestjs/common';
import type { RbacAuditLogger } from './audit';
import type { RbacSubjectResolver, RbacTenantResolver } from './resolvers';
import type { RbacStorage } from './storage';

export interface RbacModuleOptions {
  storage: RbacStorage;
  subjectResolver?: RbacSubjectResolver;
  tenantResolver?: RbacTenantResolver;
  auditLogger?: RbacAuditLogger;
  requireMetadata?: boolean;
  tenant?: {
    requiredByDefault?: boolean;
    allowGlobalRolesInTenant?: boolean;
  };
  storageErrors?: 'deny' | 'throw';
  logAllowedDecisions?: boolean;
  now?: () => Date;
}

export interface RbacModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: unknown[];
  useFactory: (...args: never[]) => RbacModuleOptions | Promise<RbacModuleOptions>;
}
