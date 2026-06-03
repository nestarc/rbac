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
  RbacAuditEvent,
  RbacCanInput,
  RbacDecision,
  RbacDecisionReason,
  RbacModuleOptions,
  RbacRequirement,
  RbacRequirementOptions,
  RbacResourceRef,
  RbacResourceResolver,
  RbacResourceResolverFn,
  RbacResourceResolverToken,
  RbacResourceResolverTokenRef,
  RbacSubject,
  RbacTenantMode,
} from './interfaces';

type HttpRequest = Record<string, unknown>;
type RbacResourceResolverClassToken = abstract new (...args: never[]) => RbacResourceResolver;
type RbacGuardAuditContext = {
  subject: RbacSubject;
  tenantId?: string | null | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const hasSubject = (subject: RbacSubject | undefined): subject is RbacSubject =>
  subject !== undefined && isNonEmptyString(subject.type) && isNonEmptyString(subject.id);

const auditResource = (resource: RbacResourceRef | undefined): RbacResourceRef | undefined =>
  resource ? { type: resource.type, id: resource.id } : undefined;

const auditIdentity = (context: RbacGuardAuditContext): Partial<RbacAuditEvent> => ({
  tenantId: context.tenantId,
  subjectType: context.subject.type,
  subjectId: context.subject.id,
});

const isBuiltInResourceDeclaration = (
  resource: RbacRequirementOptions['resource'],
): resource is RbacBuiltInResourceDeclaration =>
  isRecord(resource) &&
  typeof resource.type === 'string' &&
  ('idParam' in resource || 'idHeader' in resource || 'idQuery' in resource);

const isResolverTokenRef = (
  resource: RbacRequirementOptions['resource'],
): resource is RbacResourceResolverTokenRef => isRecord(resource) && 'resolverToken' in resource;

const isClassResolverToken = (resource: unknown): resource is RbacResourceResolverClassToken =>
  typeof resource === 'function' &&
  isRecord(resource.prototype) &&
  typeof resource.prototype.resolve === 'function';

const isStringOrSymbolResolverToken = (
  resource: unknown,
): resource is RbacResourceResolverToken => typeof resource === 'string' || typeof resource === 'symbol';

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
        await this.logAudit({
          type: 'rbac.permission.denied',
          metadata: { reason: 'rbac_metadata_missing' },
        });
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

      if (this.options.logAllowedDecisions) {
        await this.logAllowedDecision(decision);
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
      await this.logAudit({
        type: 'rbac.permission.denied',
        metadata: { reason: 'denied_subject_missing' },
      });
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
    const resource = await this.resolveResource(context, requirement.options.resource, {
      subject,
      tenantId,
    });

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
    auditContext: RbacGuardAuditContext,
  ): Promise<RbacResourceRef | undefined> {
    if (resource === undefined) {
      return undefined;
    }

    if (isBuiltInResourceDeclaration(resource)) {
      return this.ensureResource(resolveHttpResource(context, resource), auditContext);
    }

    if (isResolverTokenRef(resource)) {
      const resolver = this.resolveResourceProvider(resource);

      return this.ensureResource(await resolver.resolve(context), auditContext);
    }

    if (isClassResolverToken(resource)) {
      const resolver = this.resolveResourceProvider(resource);

      return this.ensureResource(await resolver.resolve(context), auditContext);
    }

    if (typeof resource === 'function') {
      const resolver = resource as RbacResourceResolverFn;

      return this.ensureResource(await resolver(context), auditContext);
    }

    if (isStringOrSymbolResolverToken(resource)) {
      const resolver = this.resolveResourceProvider(resource);

      return this.ensureResource(await resolver.resolve(context), auditContext);
    }

    return undefined;
  }

  private resolveResourceProvider(
    resource: RbacResourceResolverToken | RbacResourceResolverTokenRef,
  ): RbacResourceResolver {
    const resolverToken = isResolverTokenRef(resource) ? resource.resolverToken : resource;

    try {
      const resolver = this.moduleRef.get<RbacResourceResolver | undefined>(
        resolverToken,
        { strict: false },
      );

      if (resolver === undefined || typeof resolver.resolve !== 'function') {
        throw new RbacResourceMissingError({
          resolverToken: String(resolverToken),
        });
      }

      return resolver;
    } catch (error) {
      if (error instanceof RbacResourceMissingError) {
        throw mapRbacErrorToHttpException(error);
      }

      throw mapRbacErrorToHttpException(
        new RbacResourceMissingError(
          { resolverToken: String(resolverToken) },
          { cause: error },
        ),
      );
    }
  }

  private async ensureResource(
    resource: unknown,
    auditContext: RbacGuardAuditContext,
  ): Promise<RbacResourceRef> {
    if (!isRecord(resource) || !isNonEmptyString(resource.type) || !isNonEmptyString(resource.id)) {
      await this.logAudit({
        type: 'rbac.permission.denied',
        ...auditIdentity(auditContext),
        metadata: { reason: 'denied_resource_missing' },
      });
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
    await this.logAudit({
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
  }

  private async logAllowedDecision(decision: RbacDecision): Promise<void> {
    const metadata: Record<string, unknown> = { reason: decision.reason };
    if (decision.permission !== undefined) {
      metadata.permission = decision.permission;
    }
    if (decision.permissions !== undefined) {
      metadata.permissions = decision.permissions;
    }
    if (decision.roleKey !== undefined) {
      metadata.roleKey = decision.roleKey;
    }
    if (decision.matchedRoleKeys !== undefined) {
      metadata.matchedRoleKeys = decision.matchedRoleKeys;
    }
    if (decision.matchedPermissions !== undefined) {
      metadata.matchedPermissions = decision.matchedPermissions;
    }
    const resource = auditResource(decision.resource);
    if (resource !== undefined) {
      metadata.resource = resource;
    }

    await this.logAudit({
      type: 'rbac.permission.allowed',
      tenantId: decision.tenantId,
      subjectType: decision.subject?.type,
      subjectId: decision.subject?.id,
      metadata,
    });
  }

  private async logAudit(event: RbacAuditEvent): Promise<void> {
    try {
      await this.options.auditLogger?.log(event);
    } catch {
      // Preserve the RBAC HTTP response even when audit logging fails.
    }
  }
}
