import type { RbacModuleOptions } from '../interfaces';

export function createStrictRbacOptions(options: RbacModuleOptions): RbacModuleOptions {
  return {
    ...options,
    requireMetadata: options.requireMetadata ?? true,
    tenant: {
      requiredByDefault: options.tenant?.requiredByDefault ?? true,
      allowGlobalRolesInTenant: options.tenant?.allowGlobalRolesInTenant ?? false,
      resolverMode: options.tenant?.resolverMode ?? 'authoritative',
    },
    storageErrors: options.storageErrors ?? 'deny',
    logAllowedDecisions: options.logAllowedDecisions ?? false,
    writeValidation: {
      rejectTenantMismatch: options.writeValidation?.rejectTenantMismatch ?? true,
      rejectResourceWithoutTenant: options.writeValidation?.rejectResourceWithoutTenant ?? true,
      rejectGlobalRoleInTenantBinding:
        options.writeValidation?.rejectGlobalRoleInTenantBinding ?? false,
    },
  };
}
