import type { FactoryProvider, ModuleMetadata } from '@nestjs/common';
import type { RbacAuditLogger } from './audit';
import type { RbacSubjectResolver, RbacTenantResolver } from './resolvers';
import type { RbacStorage } from './storage';

export interface RbacModuleOptions {
  storage: RbacStorage;
  subjectResolver?: RbacSubjectResolver | undefined;
  tenantResolver?: RbacTenantResolver | undefined;
  auditLogger?: RbacAuditLogger | undefined;
  requireMetadata?: boolean | undefined;
  tenant?:
    | {
        requiredByDefault?: boolean | undefined;
        allowGlobalRolesInTenant?: boolean | undefined;
      }
    | undefined;
  storageErrors?: 'deny' | 'throw' | undefined;
  logAllowedDecisions?: boolean | undefined;
  now?: (() => Date) | undefined;
}

export interface RbacModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: FactoryProvider<RbacModuleOptions>['inject'] | undefined;
  useFactory: FactoryProvider<RbacModuleOptions>['useFactory'];
}
