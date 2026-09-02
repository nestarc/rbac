import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import {
  RBAC_OPTIONS,
  RBAC_REQUIREMENTS_METADATA,
  RBAC_SKIP_METADATA,
  RBAC_SUBJECT_REQUEST_KEY,
} from './constants';
import { mapRbacErrorToHttpException, RbacPermissionDeniedError } from './errors';
import { RbacGuardAudit } from './guard/rbac-guard-audit';
import { RbacGuardContextResolver } from './guard/rbac-guard-context.resolver';
import { RbacGuardRequirementEvaluator } from './guard/rbac-guard-requirement.evaluator';
import type { RbacModuleOptions } from './interfaces';
import { RbacService } from './rbac.service';

type HttpRequest = Record<string, unknown>;

/** Nest HTTP authorization guard. Other transports should call `RbacService` from their adapter. */
@Injectable()
export class RbacGuard implements CanActivate {
  private readonly audit: RbacGuardAudit;
  private readonly contextResolver: RbacGuardContextResolver;
  private readonly requirementEvaluator: RbacGuardRequirementEvaluator;

  constructor(
    private readonly reflector: Reflector,
    rbac: RbacService,
    @Inject(RBAC_OPTIONS) private readonly options: RbacModuleOptions,
    moduleRef: ModuleRef,
  ) {
    this.audit = new RbacGuardAudit(options);
    this.contextResolver = new RbacGuardContextResolver(options, moduleRef, this.audit);
    this.requirementEvaluator = new RbacGuardRequirementEvaluator(
      rbac,
      options,
      this.audit,
      this.contextResolver,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const skip = this.reflector.getAllAndOverride<unknown>(RBAC_SKIP_METADATA, targets);
    if (skip !== undefined) return true;

    const requirements =
      this.reflector.getAllAndMerge<unknown[]>(RBAC_REQUIREMENTS_METADATA, targets) ?? [];
    if (requirements.length === 0) {
      if (this.options.requireMetadata) {
        await this.audit.metadataMissing();
        throw mapRbacErrorToHttpException(new RbacPermissionDeniedError());
      }

      return true;
    }
    const validatedRequirements = this.requirementEvaluator.validate(requirements);

    const subject = await this.contextResolver.resolveSubject(context);
    const request = context.switchToHttp().getRequest<HttpRequest>();
    request[RBAC_SUBJECT_REQUEST_KEY] = subject;

    await this.requirementEvaluator.assertAllowed(context, validatedRequirements, subject);

    return true;
  }
}
