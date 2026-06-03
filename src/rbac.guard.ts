import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import {
  RBAC_OPTIONS,
  RBAC_REQUIREMENTS_METADATA,
  RBAC_SKIP_METADATA,
  RBAC_SUBJECT_REQUEST_KEY,
} from './constants';
import {
  mapRbacErrorToHttpException,
  RbacError,
  RbacPermissionDeniedError,
  RbacResourceMissingError,
  RbacStorageError,
  RbacSubjectMissingError,
  RbacTenantMissingError,
} from './errors';
import { defaultHttpSubjectResolver, resolveHttpResource, resolveHttpTenant } from './resolvers';
import { RbacService } from './rbac.service';
import type {
  RbacBuiltInResourceDeclaration,
  RbacCanInput,
  RbacDecision,
  RbacDecisionReason,
  RbacModuleOptions,
  RbacRequirement,
  RbacRequirementOptions,
  RbacResourceRef,
  RbacResourceResolver,
  RbacResourceResolverTokenRef,
  RbacSubject,
  RbacTenantMode,
} from './interfaces';

type HttpRequest = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const hasSubject = (subject: RbacSubject | undefined): subject is RbacSubject =>
  subject !== undefined && isNonEmptyString(subject.type) && isNonEmptyString(subject.id);

const auditResource = (resource: RbacResourceRef | undefined): RbacResourceRef | undefined =>
  resource ? { type: resource.type, id: resource.id } : undefined;

const isBuiltInResourceDeclaration = (
  resource: RbacRequirementOptions['resource'],
): resource is RbacBuiltInResourceDeclaration =>
  isRecord(resource) &&
  typeof resource.type === 'string' &&
  ('idParam' in resource || 'idHeader' in resource || 'idQuery' in resource);

const isResolverTokenRef = (
  resource: RbacRequirementOptions['resource'],
): resource is RbacResourceResolverTokenRef => isRecord(resource) && 'resolverToken' in resource;

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
    @Inject(RBAC_OPTIONS) private readonly options: RbacModuleOptions,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const skip = this.reflector.getAllAndOverride<unknown>(RBAC_SKIP_METADATA, targets);
    if (skip !== undefined) {
      return true;
    }

    const requirements =
      this.reflector.getAllAndMerge<RbacRequirement[]>(RBAC_REQUIREMENTS_METADATA, targets) ?? [];
    if (requirements.length === 0) {
      if (this.options.requireMetadata) {
        throw mapRbacErrorToHttpException(new RbacPermissionDeniedError());
      }

      return true;
    }

    const subject = await this.resolveSubject(context);
    const request = context.switchToHttp().getRequest<HttpRequest>();
    request[RBAC_SUBJECT_REQUEST_KEY] = subject;

    for (const requirement of requirements) {
      const decision = await this.checkRequirement(context, requirement, subject);
      if (!decision.allowed) {
        await this.logDeniedDecision(decision);
        throw this.deniedDecisionToHttpException(decision.reason);
      }
    }

    return true;
  }

  private async checkRequirement(
    context: ExecutionContext,
    requirement: RbacRequirement,
    subject: RbacSubject,
  ) {
    try {
      return await this.rbac.can(await this.toCanInput(context, requirement, subject));
    } catch (error) {
      if (error instanceof RbacError) {
        throw mapRbacErrorToHttpException(error);
      }

      throw error;
    }
  }

  private async resolveSubject(context: ExecutionContext): Promise<RbacSubject> {
    const resolver = this.options.subjectResolver ?? defaultHttpSubjectResolver();
    const subject = await resolver(context);

    if (!hasSubject(subject)) {
      throw mapRbacErrorToHttpException(new RbacSubjectMissingError());
    }

    return subject;
  }

  private async toCanInput(
    context: ExecutionContext,
    requirement: RbacRequirement,
    subject: RbacSubject,
  ): Promise<RbacCanInput> {
    const tenantMode = this.resolveTenantMode(requirement.options);
    const tenantId = await this.resolveTenant(context, requirement.options, subject);
    const resource = await this.resolveResource(context, requirement.options.resource);

    if (requirement.kind === 'role') {
      return {
        subject,
        tenantId,
        tenantMode,
        roleKey: requirement.roleKey,
        ...(resource !== undefined ? { resource } : {}),
      };
    }

    return {
      subject,
      tenantId,
      tenantMode,
      permissions: requirement.permissions,
      mode: requirement.mode,
      ...(resource !== undefined ? { resource } : {}),
    };
  }

  private resolveTenantMode(options: RbacRequirementOptions): RbacTenantMode {
    return options.tenant ?? (this.options.tenant?.requiredByDefault ? 'required' : 'optional');
  }

  private resolveTenant(
    context: ExecutionContext,
    requirementOptions: RbacRequirementOptions,
    subject: RbacSubject,
  ): Promise<string | null | undefined> | string | null | undefined {
    const defaultTenantId = resolveHttpTenant(context, requirementOptions, subject);
    if (defaultTenantId !== undefined || this.options.tenantResolver === undefined) {
      return defaultTenantId;
    }

    return this.options.tenantResolver(context, requirementOptions, subject);
  }

  private async resolveResource(
    context: ExecutionContext,
    resource: RbacRequirementOptions['resource'],
  ): Promise<RbacResourceRef | undefined> {
    if (resource === undefined) {
      return undefined;
    }

    if (typeof resource === 'function') {
      return this.ensureResource(await resource(context));
    }

    if (isBuiltInResourceDeclaration(resource)) {
      return this.ensureResource(resolveHttpResource(context, resource));
    }

    if (isResolverTokenRef(resource)) {
      const resolver = this.resolveResourceProvider(resource);

      return this.ensureResource(await resolver.resolve(context));
    }

    return undefined;
  }

  private resolveResourceProvider(resource: RbacResourceResolverTokenRef): RbacResourceResolver {
    try {
      const resolver = this.moduleRef.get<RbacResourceResolver | undefined>(
        resource.resolverToken,
        { strict: false },
      );

      if (resolver === undefined || typeof resolver.resolve !== 'function') {
        throw new RbacResourceMissingError({
          resolverToken: String(resource.resolverToken),
        });
      }

      return resolver;
    } catch (error) {
      if (error instanceof RbacResourceMissingError) {
        throw mapRbacErrorToHttpException(error);
      }

      throw mapRbacErrorToHttpException(
        new RbacResourceMissingError(
          { resolverToken: String(resource.resolverToken) },
          { cause: error },
        ),
      );
    }
  }

  private ensureResource(resource: unknown): RbacResourceRef {
    if (!isRecord(resource) || !isNonEmptyString(resource.type) || !isNonEmptyString(resource.id)) {
      throw mapRbacErrorToHttpException(new RbacResourceMissingError());
    }

    return {
      type: resource.type.trim(),
      id: resource.id.trim(),
    };
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

  private async logDeniedDecision(decision: RbacDecision): Promise<void> {
    try {
      await this.options.auditLogger?.log({
        type: 'rbac.permission.denied',
        tenantId: decision.tenantId,
        subjectType: decision.subject?.type,
        subjectId: decision.subject?.id,
        metadata: {
          reason: decision.reason,
          permission: decision.permission,
          permissions: decision.permissions,
          roleKey: decision.roleKey,
          resource: auditResource(decision.resource),
        },
      });
    } catch {
      // Preserve the RBAC HTTP response even when audit logging fails.
    }
  }
}
