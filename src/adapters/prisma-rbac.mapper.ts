import type { RbacEffectiveRole, RbacRole, RbacRoleBinding } from '../interfaces';

export interface PrismaRoleRecord {
  id: string;
  key: string;
  name: string | null;
  description: string | null;
  tenantId: string | null;
  isSystem: boolean;
  permissions?: Array<{ permission: { key: string } }>;
}

export type PrismaJson =
  | null
  | string
  | number
  | boolean
  | PrismaJson[]
  | { [key: string]: PrismaJson };

export interface PrismaBindingRecord {
  id: string;
  tenantId: string | null;
  subjectType: string;
  subjectId: string;
  roleId: string;
  resourceType: string | null;
  resourceId: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  metadata: PrismaJson | null;
}

export interface PrismaEffectiveBindingRecord extends PrismaBindingRecord {
  role: PrismaRoleRecord & {
    permissions?: Array<{ permission: { key: string } }>;
  };
}

const metadataTypeKey = '__nestarcRbacJson';
const metadataValueKey = 'value';

export const cloneDate = (date: Date | null | undefined): Date | null =>
  date ? new Date(date) : null;

const encodeMetadataValue = (value: unknown): PrismaJson | undefined => {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (value instanceof Date) {
    return { [metadataTypeKey]: 'date', [metadataValueKey]: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return {
      [metadataTypeKey]: 'array',
      [metadataValueKey]: value.map((item) => encodeMetadataValue(item) ?? null),
    };
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => [key, encodeMetadataValue(nestedValue)] as const)
      .filter((entry): entry is readonly [string, PrismaJson] => entry[1] !== undefined);

    return { [metadataTypeKey]: 'object', [metadataValueKey]: Object.fromEntries(entries) };
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.description ?? null;
  if (typeof value === 'function') return value.name ? `[Function ${value.name}]` : '[Function]';

  return null;
};

export const encodeMetadata = (
  metadata: Record<string, unknown> | undefined,
): Record<string, PrismaJson> | undefined => {
  if (metadata === undefined) return undefined;
  return encodeMetadataValue(metadata) as Record<string, PrismaJson>;
};

const isEncodedMetadataValue = (
  value: unknown,
): value is {
  [metadataTypeKey]: 'array' | 'date' | 'object';
  [metadataValueKey]: PrismaJson;
} => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  const type = candidate[metadataTypeKey];

  return (
    Object.keys(candidate).length === 2 &&
    (type === 'array' || type === 'date' || type === 'object') &&
    metadataValueKey in candidate
  );
};

const decodeMetadataValue = (value: PrismaJson): unknown => {
  if (isEncodedMetadataValue(value)) {
    if (value[metadataTypeKey] === 'date') {
      return typeof value[metadataValueKey] === 'string'
        ? new Date(value[metadataValueKey])
        : value[metadataValueKey];
    }
    if (value[metadataTypeKey] === 'array') {
      return Array.isArray(value[metadataValueKey])
        ? value[metadataValueKey].map(decodeMetadataValue)
        : value[metadataValueKey];
    }
    if (value[metadataValueKey] && typeof value[metadataValueKey] === 'object') {
      return Object.fromEntries(
        Object.entries(value[metadataValueKey]).map(([key, nestedValue]) => [
          key,
          decodeMetadataValue(nestedValue),
        ]),
      );
    }

    return value[metadataValueKey];
  }
  if (Array.isArray(value)) return value.map(decodeMetadataValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, decodeMetadataValue(nestedValue)]),
    );
  }

  return value;
};

const decodeMetadata = (metadata: PrismaJson | null): Record<string, unknown> | undefined => {
  if (metadata === null) return undefined;
  return decodeMetadataValue(metadata) as Record<string, unknown>;
};

export const toRole = (record: PrismaRoleRecord): RbacRole => ({
  id: record.id,
  key: record.key,
  tenantId: record.tenantId,
  permissions: record.permissions?.map((entry) => entry.permission.key).sort() ?? [],
  ...(record.name !== null ? { name: record.name } : {}),
  ...(record.description !== null ? { description: record.description } : {}),
  isSystem: record.isSystem,
});

export const toBinding = (record: PrismaBindingRecord): RbacRoleBinding => {
  const binding: RbacRoleBinding = {
    id: record.id,
    tenantId: record.tenantId,
    subjectType: record.subjectType,
    subjectId: record.subjectId,
    roleId: record.roleId,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    expiresAt: cloneDate(record.expiresAt),
    revokedAt: cloneDate(record.revokedAt),
  };
  const metadata = decodeMetadata(record.metadata);

  if (metadata !== undefined) binding.metadata = metadata;
  return binding;
};

export const toEffectiveRole = (binding: PrismaEffectiveBindingRecord): RbacEffectiveRole => ({
  roleKey: binding.role.key,
  roleId: binding.roleId,
  bindingId: binding.id,
  tenantId: binding.tenantId,
  resourceType: binding.resourceType,
  resourceId: binding.resourceId,
  expiresAt: cloneDate(binding.expiresAt),
});
