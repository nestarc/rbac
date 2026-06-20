import { InMemoryRbacStorage } from '../adapters';
import type {
  AssignRoleInput,
  CreateRoleInput,
  RbacCanInput,
  RbacDecision,
  RbacDecisionReason,
  RbacModuleOptions,
} from '../interfaces';
import { RbacService } from '../rbac.service';

export interface RbacScenarioInput {
  roles?: CreateRoleInput[] | undefined;
  bindings?: AssignRoleInput[] | undefined;
  options?: Omit<RbacModuleOptions, 'storage'> | undefined;
}

export interface RbacScenario {
  storage: InMemoryRbacStorage;
  rbac: RbacService;
}

export type RbacMatrixCase = RbacCanInput & {
  allowed: boolean;
  reason?: RbacDecisionReason | undefined;
  label?: string | undefined;
};

function describeMatrixInput(input: RbacCanInput): string {
  const parts: string[] = [];
  if ('permission' in input && input.permission !== undefined) {
    parts.push(`permission=${input.permission}`);
  }
  if ('permissions' in input && input.permissions !== undefined) {
    parts.push(`permissions=${input.permissions.join(',')}`);
  }
  if ('roleKey' in input && input.roleKey !== undefined) {
    parts.push(`roleKey=${input.roleKey}`);
  }
  if (input.tenantId !== undefined) {
    parts.push(`tenantId=${input.tenantId ?? 'null'}`);
  }
  if (input.resource !== undefined) {
    parts.push(`resource=${input.resource.type}:${input.resource.id}`);
  }

  return parts.length > 0 ? parts.join(' ') : 'empty RBAC input';
}

export async function createRbacScenario(input: RbacScenarioInput = {}): Promise<RbacScenario> {
  const storage = new InMemoryRbacStorage();
  const rbac = new RbacService({ ...input.options, storage });

  for (const role of input.roles ?? []) {
    await rbac.createRole(role);
  }
  for (const binding of input.bindings ?? []) {
    await rbac.assignRole(binding);
  }

  return { storage, rbac };
}

export async function expectRbacMatrix(
  rbac: RbacService,
  cases: RbacMatrixCase[],
): Promise<RbacDecision[]> {
  const decisions: RbacDecision[] = [];

  for (const [index, matrixCase] of cases.entries()) {
    const { allowed, reason, label, ...input } = matrixCase;
    const decision = await rbac.can(input);
    decisions.push(decision);
    const caseName = label ?? `case ${index + 1}`;
    const inputDescription = describeMatrixInput(input);

    if (decision.allowed !== allowed) {
      throw new Error(
        `RBAC matrix ${caseName} expected ${allowed ? 'allow' : 'deny'} for ${inputDescription}, received ${decision.reason}`,
      );
    }
    if (!allowed && reason !== undefined && decision.reason !== reason) {
      throw new Error(
        `RBAC matrix ${caseName} expected denial reason ${reason} for ${inputDescription}, received ${decision.reason}`,
      );
    }
  }

  return decisions;
}
