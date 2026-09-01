import type { FactoryProvider, ModuleMetadata } from '@nestjs/common';
import type { RbacAuditLogger } from './audit';
import type { RbacSubjectResolver, RbacTenantResolver } from './resolvers';
import type { RbacResourceRef } from './resource';
import type { RbacStorage } from './storage';
import type { RbacSubject } from './subject';

export interface RbacWriteValidationOptions {
  rejectTenantMismatch?: boolean | undefined;
  rejectResourceWithoutTenant?: boolean | undefined;
  rejectGlobalRoleInTenantBinding?: boolean | undefined;
}

export type RbacTenantResolverMode =
  | 'authoritative'
  /** @deprecated Use the authoritative default and migrate request tenant sources. */
  | 'legacy-fallback';

export type RbacPolicyChangeEventType =
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'permission.granted'
  | 'permission.revoked'
  | 'role.assigned'
  | 'role.revoked';

export interface RbacPolicyChangeEvent {
  type: RbacPolicyChangeEventType;
  occurredAt: Date;
  tenantId?: string | null | undefined;
  subject?: Pick<RbacSubject, 'type' | 'id'> | undefined;
  roleId?: string | undefined;
  roleKey?: string | undefined;
  permissions?: string[] | undefined;
  resource?: RbacResourceRef | undefined;
  bindingId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RbacPolicyChangePublisher {
  publish(event: RbacPolicyChangeEvent): void | Promise<void>;
}

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
        /**
         * Controls whether a configured tenantResolver is authoritative.
         * `legacy-fallback` preserves the pre-0.2.2 default-first behavior and is deprecated.
         */
        resolverMode?: RbacTenantResolverMode | undefined;
      }
    | undefined;
  storageErrors?: 'deny' | 'throw' | undefined;
  logAllowedDecisions?: boolean | undefined;
  writeValidation?: RbacWriteValidationOptions | undefined;
  changePublisher?: RbacPolicyChangePublisher | undefined;
  now?: (() => Date) | undefined;
}

export interface RbacModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: FactoryProvider<RbacModuleOptions>['inject'] | undefined;
  useFactory: FactoryProvider<RbacModuleOptions>['useFactory'];
}
