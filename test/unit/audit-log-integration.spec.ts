import { describe, expect, it, vi } from 'vitest';
import { createAuditLogRbacLogger } from '../../src/integrations/audit-log';

describe('createAuditLogRbacLogger', () => {
  it('maps RBAC audit events to a structural audit logger', async () => {
    const auditLog = { log: vi.fn<(...args: unknown[]) => void>() };
    const logger = createAuditLogRbacLogger({ auditLog, source: 'rbac-test' });

    await logger.log({
      type: 'rbac.permission.denied',
      tenantId: 'tenant_1',
      subjectType: 'user',
      subjectId: 'user_1',
      metadata: {
        reason: 'denied_no_matching_permission',
        permissions: ['reports.export'],
      },
    });

    expect(auditLog.log).toHaveBeenCalledWith({
      action: 'rbac.permission.denied',
      source: 'rbac-test',
      result: 'failure',
      actorType: 'user',
      actorId: 'user_1',
      tenantId: 'tenant_1',
      metadata: {
        reason: 'denied_no_matching_permission',
        permissions: ['reports.export'],
      },
    });
  });

  it('omits raw attributes and secret-shaped metadata fields', async () => {
    const auditLog = { log: vi.fn<(...args: unknown[]) => void>() };
    const logger = createAuditLogRbacLogger({ auditLog });

    await logger.log({
      type: 'rbac.permission.allowed',
      subjectType: 'api_key',
      subjectId: 'key_1',
      metadata: {
        reason: 'allowed_by_role_permission',
        subject: {
          type: 'api_key',
          id: 'key_1',
          attributes: { email: 'private@example.com' },
        },
        token: 'secret-token',
        apiKeySecret: 'secret-key',
      },
    });

    const serialized = JSON.stringify(auditLog.log.mock.calls[0]?.[0]);

    expect(serialized).toContain('allowed_by_role_permission');
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('secret-key');
  });
});
