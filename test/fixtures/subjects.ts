import type { RbacSubject } from '../../src';

export function user(id = 'user_1', tenantId?: string): RbacSubject {
  return tenantId ? { type: 'user', id, tenantId } : { type: 'user', id };
}
