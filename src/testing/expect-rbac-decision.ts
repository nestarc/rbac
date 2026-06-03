import type { RbacCanInput, RbacDecision } from '../interfaces';
import type { RbacService } from '../rbac.service';

export async function expectAllowed(
  rbac: RbacService,
  input: RbacCanInput,
): Promise<RbacDecision> {
  const decision = await rbac.can(input);
  if (!decision.allowed) {
    throw new Error(`Expected RBAC decision to allow, received ${decision.reason}`);
  }

  return decision;
}

export async function expectDenied(
  rbac: RbacService,
  input: RbacCanInput,
  reason?: RbacDecision['reason'],
): Promise<RbacDecision> {
  const decision = await rbac.can(input);
  if (decision.allowed) {
    throw new Error('Expected RBAC decision to deny, received allowed decision');
  }
  if (reason !== undefined && decision.reason !== reason) {
    throw new Error(`Expected RBAC denial reason ${reason}, received ${decision.reason}`);
  }

  return decision;
}
