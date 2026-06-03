import 'reflect-metadata';

import { CUSTOM_ROUTE_ARGS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import {
  Can,
  CurrentRbacSubject,
  RBAC_REQUIREMENTS_METADATA,
  RBAC_SKIP_METADATA,
  RBAC_SUBJECT_REQUEST_KEY,
  RequirePermission,
  RequirePermissions,
  RequireRole,
  SkipRbac,
} from '../../src';
import type { ExecutionContext } from '@nestjs/common';
import type { RbacSubject } from '../../src';

interface CustomRouteArgMetadata {
  index: number;
  factory: (data: unknown, context: ExecutionContext) => unknown;
  data: unknown;
  pipes: unknown[];
}

describe('RBAC decorators', () => {
  it('stores a single permission requirement for Can on a handler', () => {
    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = Object.getOwnPropertyDescriptor(ReportsController.prototype, 'read')
      ?.value as object;

    expect(Reflect.getMetadata(RBAC_REQUIREMENTS_METADATA, handler)).toEqual([
      {
        kind: 'permission',
        permissions: ['reports.read'],
        mode: 'any',
        options: {},
      },
    ]);
  });

  it('exports RequirePermission as an alias of Can', () => {
    expect(typeof RequirePermission).toBe('function');
    expect(RequirePermission).toBe(Can);
  });

  it('stores role metadata on a class and permission metadata on a method', () => {
    @RequireRole('owner')
    class ReportsController {
      @RequirePermissions(['reports.read', 'reports.write'], { mode: 'all' })
      write() {
        return undefined;
      }
    }
    const handler = Object.getOwnPropertyDescriptor(ReportsController.prototype, 'write')
      ?.value as object;

    expect(Reflect.getMetadata(RBAC_REQUIREMENTS_METADATA, ReportsController)).toEqual([
      {
        kind: 'role',
        roleKey: 'owner',
        options: {},
      },
    ]);
    expect(Reflect.getMetadata(RBAC_REQUIREMENTS_METADATA, handler)).toEqual([
      {
        kind: 'permission',
        permissions: ['reports.read', 'reports.write'],
        mode: 'all',
        options: { mode: 'all' },
      },
    ]);
  });

  it('stores skip metadata with the provided reason', () => {
    class HealthController {
      @SkipRbac('health check')
      check() {
        return undefined;
      }
    }
    const handler = Object.getOwnPropertyDescriptor(HealthController.prototype, 'check')
      ?.value as object;

    expect(Reflect.getMetadata(RBAC_SKIP_METADATA, handler)).toEqual({
      reason: 'health check',
    });
  });

  it('reads the RBAC subject from the HTTP request', () => {
    class ReportsController {
      read(@CurrentRbacSubject() subject: RbacSubject) {
        return subject;
      }
    }

    const routeArgs = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ReportsController,
      'read',
    ) as Record<string, CustomRouteArgMetadata>;
    const metadataKey = Object.keys(routeArgs).find((key) =>
      key.includes(CUSTOM_ROUTE_ARGS_METADATA),
    );
    const subject: RbacSubject = { id: 'user_1', type: 'user' };
    const request = { [RBAC_SUBJECT_REQUEST_KEY]: subject };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as Pick<ExecutionContext, 'switchToHttp'> as ExecutionContext;

    expect(metadataKey).toBeDefined();
    expect(routeArgs[metadataKey as string]?.factory(undefined, context)).toBe(subject);
  });
});
