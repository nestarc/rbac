import type { ExecutionContext } from '@nestjs/common';
import type { RbacBuiltInResourceDeclaration } from '../interfaces/requirements';
import type { RbacResourceRef } from '../interfaces/resource';

type HttpRequest = {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
};

const resolveId = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }

  return undefined;
};

const getHeader = (headers: Record<string, unknown> | undefined, name: string): unknown => {
  if (headers === undefined) {
    return undefined;
  }

  return headers[name.toLowerCase()] ?? headers[name];
};

export const resolveHttpResource = (
  context: ExecutionContext,
  declaration: RbacBuiltInResourceDeclaration,
): RbacResourceRef | undefined => {
  const request = context.switchToHttp().getRequest<HttpRequest>();
  const id =
    'idParam' in declaration
      ? resolveId(request.params?.[declaration.idParam])
      : 'idQuery' in declaration
        ? resolveId(request.query?.[declaration.idQuery])
        : resolveId(getHeader(request.headers, declaration.idHeader));

  if (id === undefined) {
    return undefined;
  }

  return { type: declaration.type, id };
};
