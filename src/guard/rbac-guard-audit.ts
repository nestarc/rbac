import type {
  RbacAuditEvent,
  RbacModuleOptions,
  RbacResourceRef,
  RbacServiceDecision,
  RbacSubject,
} from '../interfaces';

export interface RbacGuardAuditContext {
  subject: RbacSubject;
  tenantId?: string | null | undefined;
}

const auditResource = (resource: RbacResourceRef | undefined): RbacResourceRef | undefined =>
  resource ? { type: resource.type, id: resource.id } : undefined;

export class RbacGuardAudit {
  constructor(private readonly options: RbacModuleOptions) {}

  async metadataMissing(): Promise<void> {
    await this.log({
      type: 'rbac.permission.denied',
      metadata: { reason: 'rbac_metadata_missing' },
    });
  }

  async subjectMissing(): Promise<void> {
    await this.log({
      type: 'rbac.permission.denied',
      metadata: { reason: 'denied_subject_missing' },
    });
  }

  async tenantSourceConflict(subject: RbacSubject): Promise<void> {
    await this.log({
      type: 'rbac.permission.denied',
      subjectType: subject.type,
      subjectId: subject.id,
      metadata: { reason: 'tenant_source_conflict' },
    });
  }

  async resourceMissing(context: RbacGuardAuditContext): Promise<void> {
    await this.log({
      type: 'rbac.permission.denied',
      tenantId: context.tenantId,
      subjectType: context.subject.type,
      subjectId: context.subject.id,
      metadata: { reason: 'denied_resource_missing' },
    });
  }

  async deniedDecision(decision: RbacServiceDecision, requirementIndex: number): Promise<void> {
    await this.log({
      type: 'rbac.permission.denied',
      tenantId: decision.tenantId,
      subjectType: decision.subject?.type,
      subjectId: decision.subject?.id,
      metadata: {
        reason: decision.reason,
        requirementIndex,
        permission: decision.permission,
        permissions: decision.permissions,
        roleKey: decision.roleKey,
        resource: auditResource(decision.resource),
        details: decision.details,
      },
    });
  }

  async allowedRequest(decisions: RbacServiceDecision[]): Promise<void> {
    const firstDecision = decisions[0]!;

    if (decisions.length === 1) {
      await this.allowedDecision(firstDecision);
      return;
    }

    const tenantId = decisions.every((decision) => decision.tenantId === firstDecision.tenantId)
      ? firstDecision.tenantId
      : undefined;

    await this.log({
      type: 'rbac.permission.allowed',
      tenantId,
      subjectType: firstDecision.subject?.type,
      subjectId: firstDecision.subject?.id,
      metadata: {
        reason: 'allowed_all_requirements',
        requirements: decisions.map((decision, requirementIndex) => ({
          requirementIndex,
          reason: decision.reason,
        })),
      },
    });
  }

  async log(event: RbacAuditEvent): Promise<void> {
    try {
      await this.options.auditLogger?.log(event);
    } catch {
      // Preserve the RBAC HTTP response even when audit logging fails.
    }
  }

  private async allowedDecision(decision: RbacServiceDecision): Promise<void> {
    const metadata: Record<string, unknown> = { reason: decision.reason };
    if (decision.permission !== undefined) metadata.permission = decision.permission;
    if (decision.permissions !== undefined) metadata.permissions = decision.permissions;
    if (decision.roleKey !== undefined) metadata.roleKey = decision.roleKey;
    if (decision.matchedRoleKeys !== undefined) metadata.matchedRoleKeys = decision.matchedRoleKeys;
    if (decision.matchedPermissions !== undefined) {
      metadata.matchedPermissions = decision.matchedPermissions;
    }
    if (decision.details !== undefined) metadata.details = decision.details;
    const resource = auditResource(decision.resource);
    if (resource !== undefined) metadata.resource = resource;

    await this.log({
      type: 'rbac.permission.allowed',
      tenantId: decision.tenantId,
      subjectType: decision.subject?.type,
      subjectId: decision.subject?.id,
      metadata,
    });
  }
}
