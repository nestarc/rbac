import { describe, expect, it } from 'vitest';
import {
  defaultHttpSubjectResolver,
  resolveHttpResource,
  resolveHttpTenant,
} from '../../src';
import type { ExecutionContext } from '@nestjs/common';
import type { RbacSubject } from '../../src';

type HttpRequest = {
  rbacSubject?: unknown;
  user?: unknown;
  apiKeyContext?: unknown;
  apiKey?: unknown;
  tenantId?: unknown;
  tenant?: unknown;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
};

const httpContext = (request: HttpRequest): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as Pick<ExecutionContext, 'switchToHttp'> as ExecutionContext;

describe('default HTTP RBAC resolvers', () => {
  describe('defaultHttpSubjectResolver', () => {
    it('prefers a valid RBAC subject on the request', () => {
      const subject: RbacSubject = {
        type: 'service_account',
        id: 'svc_1',
        tenantId: 'tenant_subject',
      };
      const context = httpContext({
        rbacSubject: subject,
        user: { type: 'service_account', id: 'svc_1', tenantId: 'tenant_subject' },
      });

      expect(defaultHttpSubjectResolver()(context)).toBe(subject);
    });

    it('falls back when request RBAC subject is invalid', () => {
      const user = { id: 'user_1', tenantId: 'tenant_user' };
      const context = httpContext({
        rbacSubject: { type: 'user', id: '' },
        user,
      });

      expect(defaultHttpSubjectResolver()(context)).toEqual({
        type: 'user',
        id: 'user_1',
        tenantId: 'tenant_user',
        attributes: user,
      });
    });

    it('normalizes numeric RBAC subject identifiers from the request', () => {
      const context = httpContext({
        rbacSubject: { type: 'user', id: 123, tenantId: 'tenant_subject' },
      });

      expect(defaultHttpSubjectResolver()(context)).toEqual({
        type: 'user',
        id: '123',
        tenantId: 'tenant_subject',
      });
    });

    it('maps request user records using the first usable identifier', () => {
      const user = {
        sub: 'sub_1',
        type: 'service_account',
        userId: 'user_1',
        tenantId: 'tenant_user',
        email: 'user@example.com',
      };
      const context = httpContext({ user });

      expect(defaultHttpSubjectResolver()(context)).toEqual({
        type: 'service_account',
        id: 'sub_1',
        tenantId: 'tenant_user',
        attributes: user,
      });
    });

    it('preserves a custom request user namespace as a compatibility contract', () => {
      const user = {
        id: 'svc_1',
        type: 'service_account',
        tenantId: 'tenant_user',
      };

      expect(defaultHttpSubjectResolver()(httpContext({ user }))).toEqual({
        type: 'service_account',
        id: 'svc_1',
        tenantId: 'tenant_user',
        attributes: user,
      });
    });

    it.each([undefined, '', 42])('defaults an invalid request user type %j to user', (type) => {
      const user = { id: 'user_1', type };

      expect(defaultHttpSubjectResolver()(httpContext({ user }))).toEqual({
        type: 'user',
        id: 'user_1',
        attributes: user,
      });
    });

    it('selects the highest-authority source when all subject carriers agree', () => {
      const rbacSubject: RbacSubject = {
        type: 'api_key',
        id: 'key_1',
        tenantId: 'tenant_key',
      };

      expect(
        defaultHttpSubjectResolver()(httpContext({
          rbacSubject,
          user: { type: 'api_key', id: 'key_1', tenantId: 'tenant_key' },
          apiKey: { keyId: 'key_1', tenantId: 'tenant_key' },
        })),
      ).toBe(rbacSubject);
    });

    it.each([
      {
        name: 'RBAC subject and user type',
        request: {
          rbacSubject: { type: 'service_account', id: 'principal_1', tenantId: 'tenant_1' },
          user: { type: 'user', id: 'principal_1', tenantId: 'tenant_1' },
        },
      },
      {
        name: 'RBAC subject and user id',
        request: {
          rbacSubject: { type: 'user', id: 'user_1', tenantId: 'tenant_1' },
          user: { type: 'user', id: 'user_2', tenantId: 'tenant_1' },
        },
      },
      {
        name: 'RBAC subject and user tenant',
        request: {
          rbacSubject: { type: 'user', id: 'user_1', tenantId: 'tenant_1' },
          user: { type: 'user', id: 'user_1', tenantId: 'tenant_2' },
        },
      },
      {
        name: 'user and API key namespace',
        request: {
          user: { id: 'principal_1', tenantId: 'tenant_1' },
          apiKey: { keyId: 'principal_1', tenantId: 'tenant_1' },
        },
      },
      {
        name: 'all three carriers',
        request: {
          rbacSubject: { type: 'user', id: 'user_1', tenantId: 'tenant_1' },
          user: { type: 'user', id: 'user_1', tenantId: 'tenant_1' },
          apiKey: { keyId: 'key_1', tenantId: 'tenant_1' },
        },
      },
    ])('fails closed when $name sources conflict', ({ request }) => {
      expect(defaultHttpSubjectResolver()(httpContext(request))).toBeUndefined();
    });

    it('does not hide a canonical/legacy API-key conflict behind a valid user source', () => {
      expect(
        defaultHttpSubjectResolver()(httpContext({
          user: { id: 'user_1', tenantId: 'tenant_1' },
          apiKey: { keyId: 'key_1', tenantId: 'tenant_1' },
          apiKeyContext: { keyId: 'stale_key', tenantId: 'tenant_1' },
        })),
      ).toBeUndefined();
    });

    it('maps request user records from userId when id and sub are absent', () => {
      const user = {
        userId: 'user_1',
        tenantId: 'tenant_user',
      };
      const context = httpContext({ user });

      expect(defaultHttpSubjectResolver()(context)).toEqual({
        type: 'user',
        id: 'user_1',
        tenantId: 'tenant_user',
        attributes: user,
      });
    });

    it('maps legacy API key context records when the canonical source is absent', () => {
      const apiKeyContext = {
        keyId: 'key_1',
        id: 'ignored',
        tenantId: 'tenant_key',
        scopes: ['reports.read'],
      };
      const context = httpContext({ apiKeyContext });

      expect(defaultHttpSubjectResolver()(context)).toEqual({
        type: 'api_key',
        id: 'key_1',
        tenantId: 'tenant_key',
        attributes: apiKeyContext,
      });
    });

    it('maps request API key records when API key context is absent', () => {
      const apiKey = {
        keyId: 'key_1',
        tenantId: 'tenant_key',
      };
      const context = httpContext({ apiKey });

      expect(defaultHttpSubjectResolver()(context)).toEqual({
        type: 'api_key',
        id: 'key_1',
        tenantId: 'tenant_key',
        attributes: apiKey,
      });
    });

    it('uses the canonical API key when canonical and legacy sources agree', () => {
      const apiKey = {
        keyId: 'key_1',
        tenantId: 'tenant_key',
        scopes: ['reports.read'],
      };
      const apiKeyContext = {
        id: 'key_1',
        tenantId: 'tenant_key',
        scopes: ['legacy.scope'],
      };

      expect(defaultHttpSubjectResolver()(httpContext({ apiKey, apiKeyContext }))).toEqual({
        type: 'api_key',
        id: 'key_1',
        tenantId: 'tenant_key',
        attributes: apiKey,
      });
    });

    it.each([
      {
        name: 'identity',
        apiKey: { keyId: 'canonical', tenantId: 'tenant_key' },
        apiKeyContext: { keyId: 'legacy', tenantId: 'tenant_key' },
      },
      {
        name: 'tenant',
        apiKey: { keyId: 'key_1', tenantId: 'tenant_canonical' },
        apiKeyContext: { keyId: 'key_1', tenantId: 'tenant_legacy' },
      },
    ])('fails closed when canonical and legacy API key sources conflict by $name', (request) => {
      expect(defaultHttpSubjectResolver()(httpContext(request))).toBeUndefined();
    });

    it('preserves opaque API key and tenant identifiers exactly', () => {
      const apiKey = {
        keyId: ' Key_\u212B ',
        tenantId: ' Tenant_01 ',
      };

      expect(defaultHttpSubjectResolver()(httpContext({ apiKey }))).toEqual({
        type: 'api_key',
        id: ' Key_\u212B ',
        tenantId: ' Tenant_01 ',
        attributes: apiKey,
      });
      expect(
        defaultHttpSubjectResolver()(httpContext({
          apiKeyContext: { id: 42, tenantId: 'tenant_key' },
        })),
      ).toBeUndefined();
    });

    it('maps API key records from id when keyId is absent', () => {
      const apiKeyContext = {
        id: 'key_1',
        tenantId: 'tenant_key',
      };
      const context = httpContext({ apiKeyContext });

      expect(defaultHttpSubjectResolver()(context)).toEqual({
        type: 'api_key',
        id: 'key_1',
        tenantId: 'tenant_key',
        attributes: apiKeyContext,
      });
    });
  });

  describe('resolveHttpTenant', () => {
    it('returns null when the requirement disables tenant resolution', () => {
      const subject: RbacSubject = { type: 'user', id: 'user_1', tenantId: 'tenant_subject' };
      const context = httpContext({ tenantId: 'tenant_request' });

      expect(resolveHttpTenant(context, { tenant: 'none' }, subject)).toBeNull();
    });

    it('prefers the subject tenant before request and header tenants', () => {
      const subject: RbacSubject = { type: 'user', id: 'user_1', tenantId: 'tenant_subject' };
      const context = httpContext({
        tenantId: 'tenant_request',
        tenant: { id: 'tenant_object' },
        headers: { 'x-tenant-id': 'tenant_header' },
      });

      expect(resolveHttpTenant(context, {}, subject)).toBe('tenant_subject');
    });

    it('preserves an explicit null subject tenant without falling through', () => {
      const subject: RbacSubject = { type: 'user', id: 'user_1', tenantId: null };
      const context = httpContext({
        tenantId: 'tenant_request',
        tenant: { id: 'tenant_object' },
        headers: { 'x-tenant-id': 'tenant_header' },
      });

      expect(resolveHttpTenant(context, {}, subject)).toBeNull();
    });

    it('reads tenant ids from request fields and headers', () => {
      expect(
        resolveHttpTenant(httpContext({ tenantId: 'tenant_request' }), {}, {
          type: 'user',
          id: 'user_1',
        }),
      ).toBe('tenant_request');
      expect(
        resolveHttpTenant(httpContext({ tenant: { id: 'tenant_object' } }), {}, {
          type: 'user',
          id: 'user_1',
        }),
      ).toBe('tenant_object');
      expect(
        resolveHttpTenant(httpContext({ headers: { 'x-tenant-id': 'tenant_header' } }), {}, {
          type: 'user',
          id: 'user_1',
        }),
      ).toBe('tenant_header');
    });

    it('preserves an explicit null request tenant id without falling through', () => {
      expect(
        resolveHttpTenant(
          httpContext({
            tenantId: null,
            tenant: { id: 'tenant_object' },
            headers: { 'x-tenant-id': 'tenant_header' },
          }),
          {},
          {
            type: 'user',
            id: 'user_1',
          },
        ),
      ).toBeNull();
    });

    it('preserves an explicit null request tenant object id without falling through', () => {
      expect(
        resolveHttpTenant(
          httpContext({
            tenant: { id: null },
            headers: { 'x-tenant-id': 'tenant_header' },
          }),
          {},
          {
            type: 'user',
            id: 'user_1',
          },
        ),
      ).toBeNull();
    });

    it('stringifies numeric zero tenant ids', () => {
      expect(
        resolveHttpTenant(httpContext({ tenantId: 0 }), {}, { type: 'user', id: 'user_1' }),
      ).toBe('0');
    });

    it('returns undefined when no tenant source resolves', () => {
      expect(
        resolveHttpTenant(httpContext({ headers: {} }), {}, { type: 'user', id: 'user_1' }),
      ).toBeUndefined();
    });
  });

  describe('resolveHttpResource', () => {
    it('resolves resource identifiers from route params, query params, and headers', () => {
      expect(
        resolveHttpResource(httpContext({ params: { reportId: 'report_1' } }), {
          type: 'report',
          idParam: 'reportId',
        }),
      ).toEqual({ type: 'report', id: 'report_1' });
      expect(
        resolveHttpResource(httpContext({ query: { invoiceId: 42 } }), {
          type: 'invoice',
          idQuery: 'invoiceId',
        }),
      ).toEqual({ type: 'invoice', id: '42' });
      expect(
        resolveHttpResource(httpContext({ headers: { 'x-project-id': 'project_1' } }), {
          type: 'project',
          idHeader: 'X-Project-Id',
        }),
      ).toEqual({ type: 'project', id: 'project_1' });
    });

    it('resolves header resources from exact-case headers when lowercase is absent', () => {
      expect(
        resolveHttpResource(httpContext({ headers: { 'X-Project-Id': 'project_1' } }), {
          type: 'project',
          idHeader: 'X-Project-Id',
        }),
      ).toEqual({ type: 'project', id: 'project_1' });
    });

    it('ignores missing and empty resource identifiers', () => {
      expect(
        resolveHttpResource(httpContext({ params: { reportId: '' } }), {
          type: 'report',
          idParam: 'reportId',
        }),
      ).toBeUndefined();
      expect(
        resolveHttpResource(httpContext({ query: { invoiceId: null } }), {
          type: 'invoice',
          idQuery: 'invoiceId',
        }),
      ).toBeUndefined();
      expect(
        resolveHttpResource(httpContext({ headers: { 'x-project-id': undefined } }), {
          type: 'project',
          idHeader: 'X-Project-Id',
        }),
      ).toBeUndefined();
    });
  });
});
