import type {
  RbacCanInput,
  RbacServiceDecision,
  RbacServiceDecisionDetails,
  RbacServiceDecisionReason,
  RbacSubject,
} from '../interfaces';

export type RbacDecisionOverrides = Partial<RbacServiceDecision> & {
  allowed: boolean;
  missingPermissions?: string[] | undefined;
};

export class RbacServiceDecisionFactory {
  create(
    input: RbacCanInput,
    reason: RbacServiceDecisionReason,
    overrides: RbacDecisionOverrides,
  ): RbacServiceDecision {
    const decision = {
      allowed: overrides.allowed,
      reason,
      subject: overrides.subject ?? input.subject,
      tenantId: overrides.tenantId,
      permission: overrides.permission ?? ('permission' in input ? input.permission : undefined),
      permissions: overrides.permissions ?? this.rawPermissions(input),
      roleKey: overrides.roleKey ?? ('roleKey' in input ? input.roleKey : undefined),
      mode: overrides.mode ?? ('mode' in input ? input.mode : undefined),
      matchedRoleKeys: overrides.matchedRoleKeys,
      matchedPermissions: overrides.matchedPermissions,
      resource: input.resource,
    };

    return {
      ...decision,
      details: overrides.details ?? this.buildDetails(decision, overrides),
    };
  }

  sanitize(decision: RbacServiceDecision): RbacServiceDecision {
    return {
      ...decision,
      subject: decision.subject ? this.sanitizeSubject(decision.subject) : undefined,
    };
  }

  private rawPermissions(input: RbacCanInput): string[] {
    const permissions: string[] = [];
    if ('permission' in input && typeof input.permission === 'string') {
      permissions.push(input.permission);
    }
    if ('permissions' in input && Array.isArray(input.permissions)) {
      permissions.push(
        ...input.permissions.filter(
          (permission): permission is string => typeof permission === 'string',
        ),
      );
    }

    return permissions;
  }

  private sanitizeSubject(subject: RbacSubject): RbacSubject {
    return {
      type: subject.type,
      id: subject.id,
      ...(subject.tenantId !== undefined ? { tenantId: subject.tenantId } : {}),
    };
  }

  private buildDetails(
    decision: Omit<RbacServiceDecision, 'details'>,
    overrides: RbacDecisionOverrides,
  ): RbacServiceDecisionDetails {
    const requirement = this.buildRequirementDetails(decision);
    const matched = this.buildMatchedDetails(decision);
    const missing = this.buildMissingDetails(decision, overrides);

    return {
      ...(requirement !== undefined ? { requirement } : {}),
      ...(matched !== undefined ? { matched } : {}),
      ...(missing !== undefined ? { missing } : {}),
      evaluationPath: [this.evaluationStep(decision.reason)],
      safeMessage: decision.reason,
    };
  }

  private buildRequirementDetails(
    decision: Omit<RbacServiceDecision, 'details'>,
  ): NonNullable<RbacServiceDecisionDetails['requirement']> | undefined {
    if (decision.roleKey !== undefined) {
      return { type: 'role', roleKeys: [decision.roleKey] };
    }

    if (decision.permissions !== undefined) {
      return {
        type: 'permission',
        permissions: decision.permissions,
        mode: decision.mode ?? (decision.permissions.length > 1 ? 'all' : 'any'),
      };
    }

    return undefined;
  }

  private buildMatchedDetails(
    decision: Omit<RbacServiceDecision, 'details'>,
  ): NonNullable<RbacServiceDecisionDetails['matched']> | undefined {
    if (decision.matchedRoleKeys === undefined && decision.matchedPermissions === undefined) {
      return undefined;
    }

    return {
      roleKeys: decision.matchedRoleKeys ?? [],
      ...(decision.matchedPermissions !== undefined
        ? { permissions: decision.matchedPermissions }
        : {}),
    };
  }

  private buildMissingDetails(
    decision: Omit<RbacServiceDecision, 'details'>,
    overrides: RbacDecisionOverrides,
  ): NonNullable<RbacServiceDecisionDetails['missing']> | undefined {
    switch (decision.reason) {
      case 'denied_subject_missing':
        return { subject: true };
      case 'denied_tenant_missing':
        return { tenant: true };
      case 'denied_tenant_conflict':
        return undefined;
      case 'denied_no_matching_role':
        return decision.roleKey !== undefined ? { roleKeys: [decision.roleKey] } : undefined;
      case 'denied_no_matching_permission':
        return { permissions: overrides.missingPermissions ?? decision.permissions ?? [] };
      default:
        return undefined;
    }
  }

  private evaluationStep(
    reason: RbacServiceDecisionReason,
  ): RbacServiceDecisionDetails['evaluationPath'][number] {
    switch (reason) {
      case 'allowed_by_role':
        return { code: 'role_matched', outcome: 'allow' };
      case 'allowed_by_role_permission':
        return { code: 'permission_matched', outcome: 'allow' };
      case 'denied_subject_missing':
        return { code: 'subject_missing', outcome: 'deny' };
      case 'denied_tenant_missing':
        return { code: 'tenant_missing', outcome: 'deny' };
      case 'denied_tenant_conflict':
        return { code: 'tenant_conflict', outcome: 'deny' };
      case 'denied_no_matching_role':
        return { code: 'role_missing', outcome: 'deny' };
      case 'denied_no_matching_permission':
        return { code: 'permission_missing', outcome: 'deny' };
      case 'denied_storage_error':
        return { code: 'storage_error', outcome: 'deny' };
    }
  }
}
