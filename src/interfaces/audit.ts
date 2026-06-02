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
  tenantId?: string | null | undefined;
  subjectType?: string | undefined;
  subjectId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RbacAuditLogger {
  log(event: RbacAuditEvent): void | Promise<void>;
}
