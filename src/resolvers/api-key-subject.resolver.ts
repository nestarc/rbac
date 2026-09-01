import type { RbacSubject } from '../interfaces/subject';

type HttpRequest = Record<string, unknown>;
type ApiKeyRecord = Record<string, unknown>;

type ParsedApiKey = {
  id: string;
  tenantId?: string;
  attributes: ApiKeyRecord;
};

const isRecord = (value: unknown): value is ApiKeyRecord =>
  typeof value === 'object' && value !== null;

const isOpaqueIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const parseApiKey = (value: unknown): ParsedApiKey | undefined => {
  if (!isRecord(value)) return undefined;

  const hasKeyId = value.keyId !== undefined;
  const hasLegacyId = value.id !== undefined;
  const hasTenantId = value.tenantId !== undefined;

  if (
    (hasKeyId && !isOpaqueIdentifier(value.keyId)) ||
    (hasLegacyId && !isOpaqueIdentifier(value.id)) ||
    (hasTenantId && !isOpaqueIdentifier(value.tenantId))
  ) {
    return undefined;
  }

  const keyId = isOpaqueIdentifier(value.keyId) ? value.keyId : undefined;
  const legacyId = isOpaqueIdentifier(value.id) ? value.id : undefined;
  const id = keyId ?? legacyId;
  if (id === undefined) return undefined;

  const tenantId = isOpaqueIdentifier(value.tenantId) ? value.tenantId : undefined;

  return {
    id,
    ...(tenantId !== undefined ? { tenantId } : {}),
    attributes: value,
  };
};

const toSubject = (apiKey: ParsedApiKey): RbacSubject => ({
  type: 'api_key',
  id: apiKey.id,
  ...(apiKey.tenantId !== undefined ? { tenantId: apiKey.tenantId } : {}),
  attributes: apiKey.attributes,
});

export const resolveApiKeySubject = (request: HttpRequest): RbacSubject | undefined => {
  const canonicalValue = request.apiKey;
  const legacyValue = request.apiKeyContext;
  const hasCanonical = canonicalValue !== undefined && canonicalValue !== null;
  const hasLegacy = legacyValue !== undefined && legacyValue !== null;

  if (hasCanonical) {
    const canonical = parseApiKey(canonicalValue);
    if (canonical === undefined) return undefined;

    if (hasLegacy) {
      const legacy = parseApiKey(legacyValue);
      if (
        legacy === undefined ||
        legacy.id !== canonical.id ||
        legacy.tenantId !== canonical.tenantId
      ) {
        return undefined;
      }
    }

    return toSubject(canonical);
  }

  if (!hasLegacy) return undefined;

  const legacy = parseApiKey(legacyValue);
  return legacy === undefined ? undefined : toSubject(legacy);
};
