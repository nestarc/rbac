import 'reflect-metadata';

import { CUSTOM_ROUTE_ARGS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
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

type RouteHandler = (...args: never[]) => unknown;

const getHandler = (target: object, key: string): RouteHandler =>
  Object.getOwnPropertyDescriptor(target, key)?.value as RouteHandler;

describe('RBAC decorators', () => {
  it('stores a single permission requirement for Can on a handler', () => {
    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');

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
    const handler = getHandler(ReportsController.prototype, 'write');

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

  it('preserves multiple RBAC requirements on the same handler', () => {
    class ReportsController {
      @Can('reports.read')
      @RequirePermissions(['reports.write'], { mode: 'all', reason: 'writer' })
      @RequireRole('report-manager')
      update() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'update');

    expect(Reflect.getMetadata(RBAC_REQUIREMENTS_METADATA, handler)).toEqual([
      {
        kind: 'role',
        roleKey: 'report-manager',
        options: {},
      },
      {
        kind: 'permission',
        permissions: ['reports.write'],
        mode: 'all',
        options: { mode: 'all', reason: 'writer' },
      },
      {
        kind: 'permission',
        permissions: ['reports.read'],
        mode: 'any',
        options: {},
      },
    ]);
  });

  it('preserves multiple RBAC requirements on the same class', () => {
    @RequirePermissions(['reports.manage'], { mode: 'all' })
    @RequireRole('owner')
    class ReportsController {}

    expect(Reflect.getMetadata(RBAC_REQUIREMENTS_METADATA, ReportsController)).toEqual([
      {
        kind: 'role',
        roleKey: 'owner',
        options: {},
      },
      {
        kind: 'permission',
        permissions: ['reports.manage'],
        mode: 'all',
        options: { mode: 'all' },
      },
    ]);
  });

  it('merges method and class requirements through Reflector.getAllAndMerge', () => {
    @RequireRole('owner')
    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const reflector = new Reflector();

    expect(
      reflector.getAllAndMerge(RBAC_REQUIREMENTS_METADATA, [handler, ReportsController]),
    ).toEqual([
      {
        kind: 'permission',
        permissions: ['reports.read'],
        mode: 'any',
        options: {},
      },
      {
        kind: 'role',
        roleKey: 'owner',
        options: {},
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
    const handler = getHandler(HealthController.prototype, 'check');

    expect(Reflect.getMetadata(RBAC_SKIP_METADATA, handler)).toEqual({
      reason: 'health check',
    });
  });

  it('lets method skip metadata override class skip metadata through Reflector.getAllAndOverride', () => {
    @SkipRbac('public controller')
    class HealthController {
      @SkipRbac('health check')
      check() {
        return undefined;
      }
    }
    const handler = getHandler(HealthController.prototype, 'check');
    const reflector = new Reflector();

    expect(reflector.getAllAndOverride(RBAC_SKIP_METADATA, [handler, HealthController])).toEqual(
      {
        reason: 'health check',
      },
    );
  });

  it('isolates stored permission requirements from caller mutations', () => {
    const permissions = ['reports.read'];
    const options = { mode: 'all', reason: 'initial reason' } as const;

    class ReportsController {
      @RequirePermissions(permissions, options)
      update() {
        return undefined;
      }
    }
    permissions.push('reports.write');
    const mutableOptions = options as { mode: 'any' | 'all'; reason: string };
    mutableOptions.mode = 'any';
    mutableOptions.reason = 'mutated reason';
    const handler = getHandler(ReportsController.prototype, 'update');

    expect(Reflect.getMetadata(RBAC_REQUIREMENTS_METADATA, handler)).toEqual([
      {
        kind: 'permission',
        permissions: ['reports.read'],
        mode: 'all',
        options: { mode: 'all', reason: 'initial reason' },
      },
    ]);
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
