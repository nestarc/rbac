import { RBAC_SUBJECT_REQUEST_KEY } from '../constants';
import type { RbacSubjectResolver } from '../interfaces/resolvers';
import type { RbacSubject, RbacSubjectType } from '../interfaces/subject';
import { resolveApiKeySubject } from './api-key-subject.resolver';

type HttpRequest = Record<string, unknown>;
type SubjectRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is SubjectRecord =>
  typeof value === 'object' && value !== null;

const resolveId = (record: SubjectRecord, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }

  return undefined;
};

const resolveTenantId = (record: SubjectRecord): string | null | undefined => {
  const tenantId = record.tenantId;

  if (tenantId === null) {
    return null;
  }
  if (typeof tenantId === 'string') {
    return tenantId;
  }
  if (typeof tenantId === 'number') {
    return String(tenantId);
  }

  return undefined;
};

const normalizeSubject = (value: unknown): RbacSubject | undefined => {
  if (!isRecord(value) || typeof value.type !== 'string' || value.type.length === 0) {
    return undefined;
  }

  const id = resolveId(value, ['id']);
  if (id === undefined) {
    return undefined;
  }

  if (typeof value.id === 'string') {
    return value as unknown as RbacSubject;
  }

  const subject: RbacSubject = {
    type: value.type,
    id,
  };
  const tenantId = resolveTenantId(value);

  if (tenantId !== undefined) {
    subject.tenantId = tenantId;
  }

  return subject;
};

const resolveSubjectType = (record: SubjectRecord, fallback: RbacSubjectType): RbacSubjectType => {
  const type = record.type;

  return typeof type === 'string' && type.length > 0 ? type : fallback;
};

const mapSubject = (
  fallbackType: RbacSubjectType,
  record: unknown,
  idKeys: string[],
): RbacSubject | undefined => {
  if (!isRecord(record)) {
    return undefined;
  }

  const id = resolveId(record, idKeys);
  if (id === undefined) {
    return undefined;
  }

  const subject: RbacSubject = {
    type: resolveSubjectType(record, fallbackType),
    id,
    attributes: record,
  };
  const tenantId = resolveTenantId(record);

  if (tenantId !== undefined) {
    subject.tenantId = tenantId;
  }

  return subject;
};

const hasPopulatedApiKeySource = (request: HttpRequest): boolean =>
  (request.apiKey !== undefined && request.apiKey !== null) ||
  (request.apiKeyContext !== undefined && request.apiKeyContext !== null);

const hasSameIdentity = (left: RbacSubject, right: RbacSubject): boolean =>
  left.type === right.type && left.id === right.id && left.tenantId === right.tenantId;

export const defaultHttpSubjectResolver = (): RbacSubjectResolver => (context) => {
  const request = context.switchToHttp().getRequest<HttpRequest>();
  const rbacSubject = request[RBAC_SUBJECT_REQUEST_KEY];
  const normalizedSubject = normalizeSubject(rbacSubject);
  const userSubject = mapSubject('user', request.user, ['id', 'sub', 'userId']);
  const apiKeySubject = resolveApiKeySubject(request);

  if (hasPopulatedApiKeySource(request) && apiKeySubject === undefined) {
    return undefined;
  }

  const candidates = [normalizedSubject, userSubject, apiKeySubject].filter(
    (subject): subject is RbacSubject => subject !== undefined,
  );
  const selected = candidates[0];

  if (selected === undefined || candidates.some((subject) => !hasSameIdentity(selected, subject))) {
    return undefined;
  }

  return selected;
};
