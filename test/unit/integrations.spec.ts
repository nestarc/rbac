import { describe, expect, it } from 'vitest';
import { createApiKeySubjectResolver } from '../../src/integrations/api-keys';
import {
  createNestarcTenancyResolver,
  createTenancyTenantResolver,
} from '../../src/integrations/tenancy';
import type { ExecutionContext } from '@nestjs/common';
import type { RbacSubject } from '../../src';

type HttpRequest = {
  apiKeyContext?: unknown;
  apiKey?: unknown;
};

const httpContext = (request: HttpRequest): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as Pick<ExecutionContext, 'switchToHttp'> as ExecutionContext;

describe('integration helpers', () => {
  describe('createTenancyTenantResolver', () => {
    it('resolves tenant ids from a dependency-free tenancy getter', () => {
      const subject: RbacSubject = { type: 'user', id: 'user_1' };
      const resolver = createTenancyTenantResolver(() => 'tenant_1');

      expect(resolver(httpContext({}), {}, subject)).toBe('tenant_1');
    });

    it('passes through missing tenant ids from the tenancy getter', () => {
      const subject: RbacSubject = { type: 'user', id: 'user_1' };
      const resolver = createTenancyTenantResolver(() => null);

      expect(resolver(httpContext({}), {}, subject)).toBeNull();
    });

    it('exports the PRD-compatible Nestarc tenancy resolver alias', () => {
      const subject: RbacSubject = { type: 'user', id: 'user_1' };
      const resolver = createNestarcTenancyResolver(() => 'tenant_alias');

      expect(resolver(httpContext({}), {}, subject)).toBe('tenant_alias');
    });
  });

  describe('createApiKeySubjectResolver', () => {
    it('maps Nestarc API key context into an RBAC subject', () => {
      const apiKeyContext = {
        keyId: 'key_1',
        tenantId: 'tenant_1',
        ownerId: 'user_1',
      };
      const resolver = createApiKeySubjectResolver();

      expect(resolver(httpContext({ apiKeyContext }))).toEqual({
        type: 'api_key',
        id: 'key_1',
        tenantId: 'tenant_1',
        attributes: apiKeyContext,
      });
    });

    it('falls back to request API key records when API key context is missing', () => {
      const apiKey = {
        id: 'key_2',
        tenantId: 42,
      };
      const resolver = createApiKeySubjectResolver();

      expect(resolver(httpContext({ apiKey }))).toEqual({
        type: 'api_key',
        id: 'key_2',
        tenantId: '42',
        attributes: apiKey,
      });
    });

    it('returns undefined for invalid API key contexts', () => {
      const resolver = createApiKeySubjectResolver();

      expect(resolver(httpContext({ apiKeyContext: 'key_1' }))).toBeUndefined();
      expect(resolver(httpContext({ apiKeyContext: { keyId: '' } }))).toBeUndefined();
      expect(resolver(httpContext({ apiKeyContext: { tenantId: 'tenant_1' } }))).toBeUndefined();
    });

    it('returns undefined when no API key context exists', () => {
      const resolver = createApiKeySubjectResolver();

      expect(resolver(httpContext({}))).toBeUndefined();
    });
  });
});
