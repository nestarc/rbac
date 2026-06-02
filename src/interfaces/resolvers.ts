import type { ExecutionContext } from '@nestjs/common';
import type { RbacRequirementOptions } from './requirements';
import type { RbacResourceRef } from './resource';
import type { RbacSubject } from './subject';

export type RbacSubjectResolver = (
  context: ExecutionContext,
) => Promise<RbacSubject | undefined> | RbacSubject | undefined;

export type RbacTenantResolver = (
  context: ExecutionContext,
  options: RbacRequirementOptions,
  subject: RbacSubject,
) => Promise<string | null | undefined> | string | null | undefined;

export type RbacResourceResolverFn = (
  context: ExecutionContext,
) => Promise<RbacResourceRef | undefined> | RbacResourceRef | undefined;
