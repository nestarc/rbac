export interface RbacAuditEvent {
  type:
    | 'rbac.role.created'
    | 'rbac.role.updated'
    | 'rbac.role.deleted'
    | 'rbac.permission.granted'
    | 'rbac.permission.revoked'
    | 'rbac.role.assigned'
    | 'rbac.role.revoked'
    | 'rbac.permission.denied';
  tenantId?: string | null;
  subjectType?: string;
  subjectId?: string;
  metadata?: Record<string, unknown>;
}

export interface RbacAuditLogger {
  log(event: RbacAuditEvent): void | Promise<void>;
}
