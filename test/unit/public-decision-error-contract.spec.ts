import { describe, expect, expectTypeOf, it } from 'vitest';
import { InMemoryRbacStorage, RbacService } from '../../src';
import { expectAllowed, expectDenied, expectRbacMatrix } from '../../src/testing';
import type {
  RbacDecision,
  RbacLegacyDecisionReason,
  RbacServiceDecision,
  RbacServiceDecisionReason,
} from '../../src';

describe('public decision and error contract', () => {
  it('types service and testing-helper results as producer-accurate decisions', () => {
    type ServiceMatchedKeys = keyof NonNullable<RbacServiceDecision['details']['matched']>;
    type ServiceMissingKeys = keyof NonNullable<RbacServiceDecision['details']['missing']>;
    type ServiceEvaluationCode = RbacServiceDecision['details']['evaluationPath'][number]['code'];

    expectTypeOf<Awaited<ReturnType<RbacService['can']>>>().toEqualTypeOf<RbacServiceDecision>();
    expectTypeOf<Awaited<ReturnType<typeof expectAllowed>>>().toEqualTypeOf<RbacServiceDecision>();
    expectTypeOf<Awaited<ReturnType<typeof expectDenied>>>().toEqualTypeOf<RbacServiceDecision>();
    expectTypeOf<Awaited<ReturnType<typeof expectRbacMatrix>>>().toEqualTypeOf<
      RbacServiceDecision[]
    >();
    expectTypeOf<
      Extract<RbacServiceDecisionReason, RbacLegacyDecisionReason>
    >().toEqualTypeOf<never>();
    expectTypeOf<Extract<ServiceMatchedKeys, 'roleIds' | 'bindingIds'>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<ServiceMissingKeys, 'resource'>>().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<
        ServiceEvaluationCode,
        'resource_missing' | 'resource_mismatch' | 'roles_loaded' | 'permissions_loaded'
      >
    >().toEqualTypeOf<never>();

    const legacyDecision: RbacDecision = {
      allowed: false,
      reason: 'denied_role_expired',
    };
    // @ts-expect-error Legacy reasons are not valid RbacService.can() results.
    const unavailableServiceReason: RbacServiceDecision['reason'] = 'denied_role_expired';

    expect(legacyDecision.reason).toBe('denied_role_expired');
    expect(unavailableServiceReason).toBe('denied_role_expired');
  });

  it('always includes safe details on service-produced decisions', async () => {
    const rbac = new RbacService({ storage: new InMemoryRbacStorage() });

    const decision = await rbac.can({
      subject: { type: 'user', id: 'user_1' },
      permission: 'reports.read',
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: 'denied_no_matching_permission',
      details: {
        evaluationPath: [{ code: 'permission_missing', outcome: 'deny' }],
        safeMessage: 'denied_no_matching_permission',
      },
    });
  });
});
