import type { ExecutionContext } from '@nestjs/common';
import type { RbacRequirementOptions } from '../interfaces/requirements';
import type { RbacSubject } from '../interfaces/subject';

type HttpRequest = {
  tenantId?: unknown;
  tenant?: unknown;
  headers?: Record<string, unknown>;
};

export interface RbacHttpTenantSource {
  source: 'subject' | 'request.tenantId' | 'request.tenant.id' | 'header';
  tenantId: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const resolveTenantId = (value: unknown): string | null | undefined => {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }

  return undefined;
};

const getHeader = (headers: Record<string, unknown> | undefined, name: string): unknown => {
  if (headers === undefined) {
    return undefined;
  }

  return headers[name.toLowerCase()] ?? headers[name];
};

export const resolveHttpTenant = (
  context: ExecutionContext,
  requirementOptions: RbacRequirementOptions,
  subject: RbacSubject,
): string | null | undefined => {
  if (requirementOptions.tenant === 'none') return null;

  return resolveHttpTenantSources(context, requirementOptions, subject)[0]?.tenantId;
};

export const resolveHttpTenantSources = (
  context: ExecutionContext,
  requirementOptions: RbacRequirementOptions,
  subject: RbacSubject,
): RbacHttpTenantSource[] => {
  if (requirementOptions.tenant === 'none') return [];

  const sources: RbacHttpTenantSource[] = [];

  const subjectTenantId = resolveTenantId(subject.tenantId);
  if (subjectTenantId !== undefined) {
    sources.push({ source: 'subject', tenantId: subjectTenantId });
  }

  const request = context.switchToHttp().getRequest<HttpRequest>();
  const requestTenantId = resolveTenantId(request.tenantId);
  if (requestTenantId !== undefined) {
    sources.push({ source: 'request.tenantId', tenantId: requestTenantId });
  }

  const tenantObjectId = isRecord(request.tenant) ? resolveTenantId(request.tenant.id) : undefined;
  if (tenantObjectId !== undefined) {
    sources.push({ source: 'request.tenant.id', tenantId: tenantObjectId });
  }

  const headerTenantId = resolveTenantId(getHeader(request.headers, 'x-tenant-id'));
  if (headerTenantId !== undefined) {
    sources.push({ source: 'header', tenantId: headerTenantId });
  }

  return sources;
};
