import type { ExecutionContext } from '@nestjs/common';
import type { RbacSubject, RbacSubjectResolver } from '../interfaces';

type ApiKeyContextLike = {
  keyId?: unknown;
  id?: unknown;
  tenantId?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
};

export function createApiKeySubjectResolver(): RbacSubjectResolver {
  return (context: ExecutionContext): RbacSubject | undefined => {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const candidate = request.apiKeyContext ?? request.apiKey;
    if (!isRecord(candidate)) {
      return undefined;
    }

    const apiKey = candidate as ApiKeyContextLike;
    const id = toNonEmptyString(apiKey.keyId) ?? toNonEmptyString(apiKey.id);
    if (id === undefined) {
      return undefined;
    }

    const tenantId = toNonEmptyString(apiKey.tenantId);

    return {
      type: 'api_key',
      id,
      ...(tenantId !== undefined ? { tenantId } : {}),
      attributes: candidate,
    };
  };
}
