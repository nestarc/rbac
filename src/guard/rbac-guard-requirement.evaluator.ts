import type { ExecutionContext } from '@nestjs/common';
import {
  mapRbacErrorToHttpException,
  RbacConfigError,
  RbacError,
  RbacPermissionDeniedError,
  RbacResourceMissingError,
  RbacStorageError,
  RbacSubjectMissingError,
  RbacTenantMissingError,
} from '../errors';
import type {
  RbacDecisionReason,
  RbacModuleOptions,
  RbacRequirement,
  RbacServiceDecision,
  RbacSubject,
} from '../interfaces';
import { RbacService } from '../rbac.service';
import { assertRbacRequirements } from '../utils/runtime-validation';
import { RbacGuardAudit } from './rbac-guard-audit';
import { RbacGuardContextResolver } from './rbac-guard-context.resolver';

export class RbacGuardRequirementEvaluator {
  constructor(
    private readonly rbac: RbacService,
    private readonly options: RbacModuleOptions,
    private readonly audit: RbacGuardAudit,
    private readonly contextResolver: RbacGuardContextResolver,
  ) {}

  validate(requirements: unknown[]): RbacRequirement[] {
    try {
      assertRbacRequirements(requirements);
      return requirements;
    } catch (error) {
      if (error instanceof RbacConfigError) throw mapRbacErrorToHttpException(error);
      throw error;
    }
  }

  async assertAllowed(
    context: ExecutionContext,
    requirements: RbacRequirement[],
    subject: RbacSubject,
  ): Promise<void> {
    const allowedDecisions: RbacServiceDecision[] = [];
    for (const [requirementIndex, requirement] of requirements.entries()) {
      const decision = await this.checkRequirement(context, requirement, subject);
      if (!decision.allowed) {
        await this.audit.deniedDecision(decision, requirementIndex);
        throw this.deniedDecisionToHttpException(decision.reason);
      }

      allowedDecisions.push(decision);
    }

    if (this.options.logAllowedDecisions) {
      await this.audit.allowedRequest(allowedDecisions);
    }
  }

  private async checkRequirement(
    context: ExecutionContext,
    requirement: RbacRequirement,
    subject: RbacSubject,
  ): Promise<RbacServiceDecision> {
    try {
      return await this.rbac.can(
        await this.contextResolver.toCanInput(context, requirement, subject),
      );
    } catch (error) {
      if (error instanceof RbacError) throw mapRbacErrorToHttpException(error);
      throw error;
    }
  }

  private deniedDecisionToHttpException(reason: RbacDecisionReason) {
    switch (reason) {
      case 'denied_subject_missing':
        return mapRbacErrorToHttpException(new RbacSubjectMissingError());
      case 'denied_tenant_missing':
        return mapRbacErrorToHttpException(new RbacTenantMissingError());
      case 'denied_resource_missing':
        return mapRbacErrorToHttpException(new RbacResourceMissingError());
      case 'denied_storage_error':
        return mapRbacErrorToHttpException(new RbacStorageError());
      default:
        return mapRbacErrorToHttpException(new RbacPermissionDeniedError());
    }
  }
}
