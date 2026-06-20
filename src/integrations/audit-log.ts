import type { RbacAuditEvent, RbacAuditLogger } from '../interfaces';

export interface AuditLogLike {
  log(event: Record<string, unknown>): void | Promise<void>;
}

export interface AuditLogRbacLoggerOptions {
  auditLog: AuditLogLike;
  source?: string | undefined;
}

const sensitiveKeyFragments = [
  'apikeysecret',
  'authorization',
  'attributes',
  'headers',
  'password',
  'secret',
  'token',
  'body',
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

  return sensitiveKeyFragments.some((fragment) => normalized.includes(fragment));
}

function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadata);
  }

  if (value instanceof Date) {
    return value;
  }

  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (isSensitiveKey(key)) continue;
      sanitized[key] = sanitizeMetadata(nestedValue);
    }

    return sanitized;
  }

  return value;
}

function auditResult(type: RbacAuditEvent['type']): 'success' | 'failure' {
  return type.endsWith('.denied') ? 'failure' : 'success';
}

export function createAuditLogRbacLogger(
  options: AuditLogRbacLoggerOptions,
): RbacAuditLogger {
  return {
    async log(event) {
      await options.auditLog.log({
        action: event.type,
        source: options.source ?? 'rbac',
        result: auditResult(event.type),
        ...(event.subjectType !== undefined ? { actorType: event.subjectType } : {}),
        ...(event.subjectId !== undefined ? { actorId: event.subjectId } : {}),
        ...(event.tenantId !== undefined ? { tenantId: event.tenantId } : {}),
        ...(event.metadata !== undefined
          ? { metadata: sanitizeMetadata(event.metadata) as Record<string, unknown> }
          : {}),
      });
    },
  };
}
