import type { RbacSubject } from '../interfaces';

export const rbacUser = (id: string, tenantId?: string | null): RbacSubject => ({
  type: 'user',
  id,
  ...(tenantId !== undefined ? { tenantId } : {}),
});

export const rbacApiKey = (id: string, tenantId?: string | null): RbacSubject => ({
  type: 'api_key',
  id,
  ...(tenantId !== undefined ? { tenantId } : {}),
});

export const rbacServiceAccount = (id: string, tenantId?: string | null): RbacSubject => ({
  type: 'service_account',
  id,
  ...(tenantId !== undefined ? { tenantId } : {}),
});
