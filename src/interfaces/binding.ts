import type { RbacResourceRef } from './resource';
import type { RbacSubject } from './subject';

export interface RbacRoleBinding {
  id: string;
  tenantId?: string | null;
  subjectType: string;
  subjectId: string;
  roleId: string;
  resourceType?: string | null;
  resourceId?: string | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface AssignRoleInput {
  tenantId?: string | null | undefined;
  subject: RbacSubject;
  roleId: string;
  resource?: RbacResourceRef | undefined;
  expiresAt?: Date | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export type AssignRoleStorageInput = AssignRoleInput;

export interface RevokeRoleInput {
  bindingId: string;
  revokedAt?: Date | undefined;
}

export type RevokeRoleStorageInput = RevokeRoleInput;

export interface ListBindingsInput {
  tenantId?: string | null | undefined;
  subject: RbacSubject;
}

export type ListBindingsStorageInput = ListBindingsInput;
