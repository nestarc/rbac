import type { ExecutionContext } from '@nestjs/common';
import type { RbacRequirementOptions } from './requirements';
import type { RbacResourceRef } from './resource';
import type { RbacSubject } from './subject';

/**
 * Resolves a subject for the HTTP-only `RbacGuard` pipeline in 0.2.x.
 * Receiving an `ExecutionContext` does not make the complete Guard transport-neutral.
 */
export type RbacSubjectResolver = (
  context: ExecutionContext,
) => Promise<RbacSubject | undefined> | RbacSubject | undefined;

/** Resolves a trusted tenant for the HTTP-only `RbacGuard` pipeline in 0.2.x. */
export type RbacTenantResolver = (
  context: ExecutionContext,
  options: RbacRequirementOptions,
  subject: RbacSubject,
) => Promise<string | null | undefined> | string | null | undefined;

/** Resolves a resource for the HTTP-only `RbacGuard` pipeline in 0.2.x. */
export type RbacResourceResolverFn = (
  context: ExecutionContext,
) => Promise<RbacResourceRef | undefined> | RbacResourceRef | undefined;
