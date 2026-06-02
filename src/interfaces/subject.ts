export type RbacSubjectType = 'user' | 'api_key' | 'service_account' | (string & {});

export interface RbacSubject {
  type: RbacSubjectType;
  id: string;
  tenantId?: string | null;
  displayName?: string;
  attributes?: Record<string, unknown>;
}
