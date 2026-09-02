import type { ExecutionContext } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import {
  mapRbacErrorToHttpException,
  RbacPermissionDeniedError,
  RbacResourceMissingError,
  RbacSubjectMissingError,
} from '../errors';
import type {
  RbacBuiltInResourceDeclaration,
  RbacCanInput,
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
} from '../interfaces';
import { defaultHttpSubjectResolver, resolveHttpResource } from '../resolvers';
import {
  resolveHttpTenantSources,
  type RbacHttpTenantSource,
} from '../resolvers/default-http-tenant.resolver';
import { isRbacSubject } from '../utils/runtime-validation';
import { RbacGuardAudit, type RbacGuardAuditContext } from './rbac-guard-audit';

type RbacResourceResolverClassToken = abstract new (...args: never[]) => RbacResourceResolver;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

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

const isStringOrSymbolResolverToken = (resource: unknown): resource is RbacResourceResolverToken =>
  typeof resource === 'string' || typeof resource === 'symbol';

export class RbacGuardContextResolver {
  constructor(
    private readonly options: RbacModuleOptions,
    private readonly moduleRef: ModuleRef,
    private readonly audit: RbacGuardAudit,
  ) {}

  async resolveSubject(context: ExecutionContext): Promise<RbacSubject> {
    const resolver = this.options.subjectResolver ?? defaultHttpSubjectResolver();
    const subject = await resolver(context);

    if (!isRbacSubject(subject)) {
      await this.audit.subjectMissing();
      throw mapRbacErrorToHttpException(new RbacSubjectMissingError());
    }

    return subject;
  }

  async toCanInput(
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

  private async resolveTenant(
    context: ExecutionContext,
    requirementOptions: RbacRequirementOptions,
    subject: RbacSubject,
  ): Promise<string | null | undefined> {
    if (requirementOptions.tenant === 'none') return null;

    const httpSources = resolveHttpTenantSources(context, requirementOptions, subject);
    const resolver = this.options.tenantResolver;
    const resolverMode = this.options.tenant?.resolverMode ?? 'authoritative';

    if (resolverMode === 'legacy-fallback' && httpSources.length > 0) {
      await this.ensureTenantSourcesAgree(httpSources, subject);
      return httpSources[0]?.tenantId;
    }

    const trustedTenantId = await resolver?.(context, requirementOptions, subject);
    const sources =
      trustedTenantId === undefined
        ? httpSources
        : [{ source: 'configuredResolver' as const, tenantId: trustedTenantId }, ...httpSources];

    await this.ensureTenantSourcesAgree(sources, subject);

    return trustedTenantId !== undefined ? trustedTenantId : httpSources[0]?.tenantId;
  }

  private async ensureTenantSourcesAgree(
    sources: Array<
      | RbacHttpTenantSource
      | {
          source: 'configuredResolver';
          tenantId: string | null;
        }
    >,
    subject: RbacSubject,
  ): Promise<void> {
    const selected = sources[0]?.tenantId;
    if (sources.every((source) => source.tenantId === selected)) return;

    await this.audit.tenantSourceConflict(subject);
    throw mapRbacErrorToHttpException(new RbacPermissionDeniedError());
  }

  private async resolveResource(
    context: ExecutionContext,
    resource: RbacRequirementOptions['resource'],
    auditContext: RbacGuardAuditContext,
  ): Promise<RbacResourceRef | undefined> {
    if (resource === undefined) return undefined;

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
      const resolver = this.moduleRef.get<RbacResourceResolver | undefined>(resolverToken, {
        strict: false,
      });

      if (resolver === undefined || typeof resolver.resolve !== 'function') {
        throw new RbacResourceMissingError({ resolverToken: String(resolverToken) });
      }

      return resolver;
    } catch (error) {
      if (error instanceof RbacResourceMissingError) {
        throw mapRbacErrorToHttpException(error);
      }

      throw mapRbacErrorToHttpException(
        new RbacResourceMissingError({ resolverToken: String(resolverToken) }, { cause: error }),
      );
    }
  }

  private async ensureResource(
    resource: unknown,
    auditContext: RbacGuardAuditContext,
  ): Promise<RbacResourceRef> {
    if (!isRecord(resource) || !isNonEmptyString(resource.type) || !isNonEmptyString(resource.id)) {
      await this.audit.resourceMissing(auditContext);
      throw mapRbacErrorToHttpException(new RbacResourceMissingError());
    }

    return { type: resource.type.trim(), id: resource.id.trim() };
  }
}
