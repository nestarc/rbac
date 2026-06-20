import { describe, expect, it } from 'vitest';
import { InMemoryRbacStorage, createStrictRbacOptions } from '../../src';

describe('createStrictRbacOptions', () => {
  it('builds fail-closed RBAC options without changing storage', () => {
    const storage = new InMemoryRbacStorage();

    expect(createStrictRbacOptions({ storage })).toMatchObject({
      storage,
      requireMetadata: true,
      tenant: {
        requiredByDefault: true,
        allowGlobalRolesInTenant: false,
      },
      storageErrors: 'deny',
      logAllowedDecisions: false,
      writeValidation: {
        rejectTenantMismatch: true,
        rejectResourceWithoutTenant: true,
        rejectGlobalRoleInTenantBinding: false,
      },
    });
  });

  it('preserves explicit overrides', () => {
    const storage = new InMemoryRbacStorage();

    expect(
      createStrictRbacOptions({
        storage,
        requireMetadata: false,
        tenant: {
          requiredByDefault: false,
          allowGlobalRolesInTenant: true,
        },
        storageErrors: 'throw',
        logAllowedDecisions: true,
        writeValidation: {
          rejectTenantMismatch: false,
          rejectResourceWithoutTenant: false,
          rejectGlobalRoleInTenantBinding: true,
        },
      }),
    ).toMatchObject({
      storage,
      requireMetadata: false,
      tenant: {
        requiredByDefault: false,
        allowGlobalRolesInTenant: true,
      },
      storageErrors: 'throw',
      logAllowedDecisions: true,
      writeValidation: {
        rejectTenantMismatch: false,
        rejectResourceWithoutTenant: false,
        rejectGlobalRoleInTenantBinding: true,
      },
    });
  });
});
