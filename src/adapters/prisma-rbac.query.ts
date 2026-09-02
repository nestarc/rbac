import type {
  AssignRoleStorageInput,
  ListEffectiveRolesInput,
  UpsertRoleInput,
} from '../interfaces';
import { normalizePermissions } from '../utils';
import {
  canonicalizeIdentifier,
  canonicalizeResource,
  canonicalizeSubject,
  canonicalizeTenantId,
} from '../utils/canonicalization';
import type { PrismaRoleRecord } from './prisma-rbac.mapper';

export const normalizeTenantId = (tenantId: string | null | undefined): string | null =>
  canonicalizeTenantId(tenantId) ?? null;

export const canonicalizeUpsertRoleInput = (input: UpsertRoleInput): UpsertRoleInput =>
  'roleId' in input
    ? {
        ...input,
        roleId: canonicalizeIdentifier(input.roleId, 'roleId'),
        ...(input.tenantId !== undefined ? { tenantId: canonicalizeTenantId(input.tenantId) } : {}),
        ...(input.key !== undefined ? { key: canonicalizeIdentifier(input.key, 'role key') } : {}),
        ...(input.permissions !== undefined
          ? { permissions: normalizePermissions(input.permissions) }
          : {}),
      }
    : {
        ...input,
        tenantId: canonicalizeTenantId(input.tenantId),
        key: canonicalizeIdentifier(input.key, 'role key'),
        permissions: normalizePermissions(input.permissions),
      };

export const canonicalizeAssignInput = (input: AssignRoleStorageInput): AssignRoleStorageInput => ({
  ...input,
  tenantId: canonicalizeTenantId(input.tenantId),
  subject: canonicalizeSubject(input.subject),
  roleId: canonicalizeIdentifier(input.roleId, 'roleId'),
  ...(input.resource !== undefined ? { resource: canonicalizeResource(input.resource) } : {}),
});

export const roleWhere = (
  tenantId: string | null,
  key: string,
): { tenantId: string | null; key: string } => ({ tenantId, key });

const samePermissions = (record: PrismaRoleRecord, permissions: string[]): boolean => {
  const stored = record.permissions?.map((entry) => entry.permission.key).sort() ?? [];
  const requested = [...permissions].sort();

  return (
    stored.length === requested.length && stored.every((value, index) => value === requested[index])
  );
};

export const roleInputChangesRecord = (
  record: PrismaRoleRecord,
  input: UpsertRoleInput,
): boolean => {
  if (input.key !== undefined && input.key !== record.key) return true;
  if (input.tenantId !== undefined && normalizeTenantId(input.tenantId) !== record.tenantId) {
    return true;
  }
  if (input.name !== undefined && input.name !== record.name) return true;
  if (input.description !== undefined && input.description !== record.description) return true;
  if (input.isSystem !== undefined && input.isSystem !== record.isSystem) return true;

  return input.permissions !== undefined && !samePermissions(record, input.permissions);
};

export const effectiveBindingWhere = (
  input: ListEffectiveRolesInput,
  now: Date,
): Record<string, unknown> => {
  const subject = canonicalizeSubject(input.subject);
  const tenantId = normalizeTenantId(input.tenantId);
  const resource = input.resource ? canonicalizeResource(input.resource) : undefined;
  const resourceFilter = resource
    ? {
        OR: [
          { resourceType: null, resourceId: null },
          { resourceType: resource.type, resourceId: resource.id },
        ],
      }
    : { resourceType: null, resourceId: null };

  return {
    subjectType: subject.type,
    subjectId: subject.id,
    tenantId,
    revokedAt: null,
    role: { tenantId },
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }, resourceFilter],
  };
};
