import type { RbacAuditEvent, RbacAuditLogger } from '../interfaces';

export class NoopRbacAuditLogger implements RbacAuditLogger {
  log(event: RbacAuditEvent): void {
    void event;
  }
}
