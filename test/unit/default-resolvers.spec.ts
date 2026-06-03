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
        user: { id: 'user_1', tenantId: 'tenant_user' },
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
        userId: 'user_1',
        tenantId: 'tenant_user',
        email: 'user@example.com',
      };
      const context = httpContext({ user });

      expect(defaultHttpSubjectResolver()(context)).toEqual({
        type: 'user',
        id: 'sub_1',
        tenantId: 'tenant_user',
        attributes: user,
      });
    });

    it('maps API key context records', () => {
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
