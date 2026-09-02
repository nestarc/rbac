import { RbacConfigError } from '../errors';
import type {
  RbacAuditEvent,
  RbacModuleOptions,
  RbacMutationResult,
  RbacPolicyChangeEvent,
} from '../interfaces';

export class RbacServiceMutationSupport {
  constructor(private readonly options: RbacModuleOptions) {}

  requireValue<T>(operation: string, result: RbacMutationResult<T>): T {
    if (result.value !== undefined) return result.value;

    throw new RbacConfigError({
      operation,
      reason: result.reason ?? 'mutation_result_missing_value',
      outcome: result.outcome,
    });
  }

  async legacy(
    mutation: () => Promise<void>,
    outcome: 'created' | 'updated' | 'deleted',
  ): Promise<RbacMutationResult> {
    await mutation();
    return { outcome };
  }

  async audit(event: RbacAuditEvent): Promise<void> {
    try {
      await this.options.auditLogger?.log(event);
    } catch {
      // Audit logging must not change RBAC write or authorization behavior.
    }
  }

  async publish(event: Omit<RbacPolicyChangeEvent, 'occurredAt'>): Promise<void> {
    try {
      await this.options.changePublisher?.publish({
        occurredAt: this.options.now?.() ?? new Date(),
        ...event,
      });
    } catch {
      // Change hooks are for cache/outbox integration and must not alter write results.
    }
  }
}
