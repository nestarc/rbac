import { describe, expect, it, vi } from 'vitest';
import { InMemoryRbacStorage } from '../../src';
import type { RbacCanInput } from '../../src';
import { RbacServiceDecisionFactory } from '../../src/service/rbac-service-decision.factory';
import { RbacServiceInput } from '../../src/service/rbac-service-input';
import { RbacServiceMutationSupport } from '../../src/service/rbac-service-mutation-support';

describe('RbacService internal seams', () => {
  it('preserves invalid permission requirements for a fail-closed decision', () => {
    const inputs = new RbacServiceInput({ storage: new InMemoryRbacStorage() });

    expect(
      inputs.permissionRequirement({
        subject: { type: 'user', id: 'user_1' },
        permissions: ['invalid permission'],
      }),
    ).toEqual({
      permission: undefined,
      permissions: ['invalid permission'],
      mode: 'any',
      invalid: true,
    });
  });

  it('builds the storage-error detail envelope without a requirement', () => {
    const decisions = new RbacServiceDecisionFactory();

    expect(
      decisions.create(
        {
          subject: { type: 'user', id: 'user_1' },
          tenantMode: 'none',
        } as unknown as RbacCanInput,
        'denied_storage_error',
        { allowed: false, tenantId: null },
      ),
    ).toMatchObject({
      allowed: false,
      reason: 'denied_storage_error',
      details: {
        evaluationPath: [{ code: 'storage_error', outcome: 'deny' }],
        safeMessage: 'denied_storage_error',
      },
    });
  });

  it('keeps legacy mutation outcomes and missing-value errors stable', async () => {
    const mutations = new RbacServiceMutationSupport({ storage: new InMemoryRbacStorage() });
    const mutation = vi.fn(() => Promise.resolve());

    await expect(mutations.legacy(mutation, 'deleted')).resolves.toEqual({ outcome: 'deleted' });
    expect(mutation).toHaveBeenCalledOnce();
    expect(() => mutations.requireValue('assignRole', { outcome: 'conflict' })).toThrowError(
      expect.objectContaining({ code: 'RBAC_CONFIG_ERROR' }),
    );
  });
});
