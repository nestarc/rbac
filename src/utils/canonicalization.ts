import type { RbacResourceRef, RbacSubject } from '../interfaces';
import { assertNonEmptyString } from './assertions';

export function canonicalizeIdentifier(value: string, name: string): string {
  return assertNonEmptyString(value, name);
}

export function isCanonicalIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value === value.trim();
}

export function canonicalizeTenantId(
  tenantId: string | null | undefined,
  name = 'tenantId',
): string | null | undefined {
  return tenantId == null ? tenantId : canonicalizeIdentifier(tenantId, name);
}

export function canonicalizeSubject(subject: RbacSubject): RbacSubject {
  const isApiKey = subject.type === 'api_key';
  const type = canonicalizeIdentifier(subject.type, 'subject.type');
  const id = isApiKey
    ? preserveOpaqueIdentifier(subject.id, 'subject.id')
    : canonicalizeIdentifier(subject.id, 'subject.id');
  const tenantId =
    isApiKey && typeof subject.tenantId === 'string'
      ? preserveOpaqueIdentifier(subject.tenantId, 'subject.tenantId')
      : canonicalizeTenantId(subject.tenantId, 'subject.tenantId');

  return {
    ...subject,
    type,
    id,
    ...(tenantId !== undefined ? { tenantId } : {}),
  };
}

export function canonicalizeResource(resource: RbacResourceRef): RbacResourceRef {
  return {
    type: canonicalizeIdentifier(resource.type, 'resource.type'),
    id: canonicalizeIdentifier(resource.id, 'resource.id'),
  };
}

function preserveOpaqueIdentifier(value: string, name: string): string {
  assertNonEmptyString(value, name);
  return value;
}
