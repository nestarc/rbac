import type { ExecutionContext } from '@nestjs/common';
import type { RbacSubject, RbacSubjectResolver } from '../interfaces';
import { resolveApiKeySubject } from '../resolvers/api-key-subject.resolver';

export function createApiKeySubjectResolver(): RbacSubjectResolver {
  return (context: ExecutionContext): RbacSubject | undefined => {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    return resolveApiKeySubject(request);
  };
}
