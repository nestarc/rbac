import 'reflect-metadata';

import { Module, type ExecutionContext } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  Can,
  InMemoryRbacStorage,
  RBAC_OPTIONS,
  RBAC_STORAGE,
  RBAC_SUBJECT_REQUEST_KEY,
  RequireRole,
  RbacConfigError,
  RbacGuard,
  RbacModule,
  RbacService,
  SkipRbac,
  type RbacAuditEvent,
  type RbacCanInput,
  type RbacModuleOptions,
  type RbacResourceRef,
  type RbacResourceResolver,
  type RbacResourceResolverFn,
  type RbacRequirementOptions,
} from '../../src';

const getHandler = (target: object, key: string) =>
  Object.getOwnPropertyDescriptor(target, key)?.value as () => unknown;

const contextFor = (
  controller: new () => unknown,
  handler: () => unknown,
  request: Record<string, unknown> = {},
): ExecutionContext =>
  ({
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as unknown as ExecutionContext;

describe('RbacModule', () => {
  it('exports a no-op audit logger from the package root', async () => {
    const exported = await import('../../src');

    expect(exported.NoopRbacAuditLogger).toBeTypeOf('function');
    expect(() =>
      new exported.NoopRbacAuditLogger().log({ type: 'rbac.permission.denied' }),
    ).not.toThrow();
  });

  it('forRoot registers and exports options, storage, service, and guard', async () => {
    const storage = new InMemoryRbacStorage();
    const options: RbacModuleOptions = { storage };
    const moduleRef = await Test.createTestingModule({
      imports: [RbacModule.forRoot(options)],
    }).compile();

    expect(moduleRef.get(RBAC_OPTIONS)).toBe(options);
    expect(moduleRef.get(RBAC_STORAGE)).toBe(storage);
    expect(moduleRef.get(RbacService)).toBeInstanceOf(RbacService);
    expect(moduleRef.get(RbacGuard)).toBeInstanceOf(RbacGuard);
  });

  it('forRootAsync supports imports, inject, and useFactory', async () => {
    const CONFIG = Symbol('CONFIG');
    const storage = new InMemoryRbacStorage();

    @Module({
      providers: [{ provide: CONFIG, useValue: { storage } }],
      exports: [CONFIG],
    })
    class ConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        RbacModule.forRootAsync({
          imports: [ConfigModule],
          inject: [CONFIG],
          useFactory: (config: { storage: InMemoryRbacStorage }) => ({
            storage: config.storage,
          }),
        }),
      ],
    }).compile();

    expect(moduleRef.get(RBAC_STORAGE)).toBe(storage);
    expect(moduleRef.get(RbacService)).toBeInstanceOf(RbacService);
    expect(moduleRef.get(RbacGuard)).toBeInstanceOf(RbacGuard);
  });
});

describe('RbacGuard', () => {
  const subject = { type: 'user' as const, id: 'user_1', tenantId: 'tenant_1' };

  const expectResourceMissing = async (promise: Promise<unknown>) => {
    await expect(promise).rejects.toMatchObject({
      response: {
        message: 'Resource missing',
        code: 'RBAC_RESOURCE_MISSING',
      },
    });
  };

  it('allows routes without RBAC metadata by default', async () => {
    class ReportsController {
      list() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'list');
    const storage = new InMemoryRbacStorage();
    const moduleRef = await Test.createTestingModule({
      imports: [RbacModule.forRoot({ storage })],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).resolves.toBe(true);
  });

  it('skips RBAC checks when skip metadata is present', async () => {
    const can = vi.fn();

    class ReportsController {
      @SkipRbac('public health check')
      @Can('reports.read')
      health() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'health');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            requireMetadata: true,
            subjectResolver: () => undefined,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).resolves.toBe(true);
    expect(can).not.toHaveBeenCalled();
  });

  it('rejects routes without RBAC metadata when requireMetadata is enabled', async () => {
    const log = vi.fn<(event: RbacAuditEvent) => void>();
    class ReportsController {
      list() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'list');
    const moduleRef = await Test.createTestingModule({
      imports: [
        RbacModule.forRoot({
          storage: new InMemoryRbacStorage(),
          requireMetadata: true,
          auditLogger: { log },
        }),
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).rejects.toMatchObject({
      response: {
        message: 'Permission denied',
        code: 'RBAC_PERMISSION_DENIED',
      },
    });
    expect(log).toHaveBeenCalledWith({
      type: 'rbac.permission.denied',
      metadata: { reason: 'rbac_metadata_missing' },
    });
  });

  it('throws a 401 coded response before resolving tenant or resource when subject is missing', async () => {
    const log = vi.fn<(event: RbacAuditEvent) => void>();
    const tenantResolver = vi.fn(() => 'tenant_1');
    const resourceResolver = vi.fn(() => ({ type: 'report', id: 'report_1' }));

    class ReportsController {
      @Can('reports.read', { resource: resourceResolver as unknown as RbacResourceResolverFn })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      imports: [
        RbacModule.forRoot({
          storage: new InMemoryRbacStorage(),
          tenantResolver,
          subjectResolver: () => undefined,
          auditLogger: { log },
        }),
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).rejects.toMatchObject({
      response: {
        message: 'Subject missing',
        code: 'RBAC_SUBJECT_MISSING',
      },
    });
    expect(tenantResolver).not.toHaveBeenCalled();
    expect(resourceResolver).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({
      type: 'rbac.permission.denied',
      metadata: { reason: 'denied_subject_missing' },
    });
  });

  it('passes stacked handler and class requirements to RbacService in handler-first order', async () => {
    @RequireRole('owner')
    class ReportsController {
      @Can('reports.read', { tenant: 'required' })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role' as const,
      });
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();
    const request: Record<string, unknown> = {};

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler, request)),
    ).resolves.toBe(true);

    expect(request[RBAC_SUBJECT_REQUEST_KEY]).toBe(subject);
    expect(can).toHaveBeenCalledTimes(2);
    expect(can.mock.calls.map(([input]: [RbacCanInput]) => input)).toEqual([
      {
        subject,
        tenantId: 'tenant_1',
        tenantMode: 'required',
        permissions: ['reports.read'],
        mode: 'any',
      },
      {
        subject,
        tenantId: 'tenant_1',
        tenantMode: 'optional',
        roleKey: 'owner',
      },
    ]);
  });

  it('uses configured tenant resolver only after default HTTP tenant sources are missing', async () => {
    class ReportsController {
      @Can('reports.read', { tenant: 'required' })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const subjectResolver = vi
      .fn()
      .mockReturnValueOnce({ type: 'user', id: 'user_1', tenantId: 'subject_tenant' })
      .mockReturnValueOnce({ type: 'user', id: 'user_2' });
    const tenantResolver = vi.fn(() => 'fallback_tenant');
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver,
            tenantResolver,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();
    const guard = moduleRef.get(RbacGuard);

    await expect(
      guard.canActivate(contextFor(ReportsController, handler, {})),
    ).resolves.toBe(true);
    expect(tenantResolver).not.toHaveBeenCalled();
    expect(can).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tenantId: 'subject_tenant',
        tenantMode: 'required',
      }),
    );

    await expect(
      guard.canActivate(contextFor(ReportsController, handler, {})),
    ).resolves.toBe(true);
    expect(tenantResolver).toHaveBeenCalledTimes(1);
    expect(can).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tenantId: 'fallback_tenant',
        tenantMode: 'required',
      }),
    );
  });

  it('uses the default HTTP subject resolver when no subject resolver is configured', async () => {
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(
        contextFor(ReportsController, handler, {
          user: { sub: 'user_1', tenantId: 'tenant_1' },
        }),
      ),
    ).resolves.toBe(true);

    expect(can.mock.calls[0]?.[0]).toMatchObject({
      subject: { type: 'user', id: 'user_1', tenantId: 'tenant_1' },
      tenantId: 'tenant_1',
    });
  });

  it('uses required tenant mode by default when configured', async () => {
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            tenant: { requiredByDefault: true },
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).resolves.toBe(true);

    expect(can.mock.calls[0]?.[0]).toMatchObject({
      tenantId: 'tenant_1',
      tenantMode: 'required',
    });
  });

  it('resolves resources from resolver token providers', async () => {
    const RESOURCE_RESOLVER = Symbol('RESOURCE_RESOLVER');
    const resolve = vi.fn(() => ({ type: 'report', id: 'report_1' }));
    const resourceResolver: RbacResourceResolver = { resolve };
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: { resolverToken: RESOURCE_RESOLVER } })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        { provide: RESOURCE_RESOLVER, useValue: resourceResolver },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).resolves.toBe(true);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(can.mock.calls[0]?.[0]).toMatchObject({
      permissions: ['reports.read'],
      resource: { type: 'report', id: 'report_1' },
    });
    expect(moduleRef.get(ModuleRef)).toBeInstanceOf(ModuleRef);
  });

  it('resolves resources from built-in HTTP parameter declarations', async () => {
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: { type: 'project', idParam: 'projectId' } })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef
        .get(RbacGuard)
        .canActivate(contextFor(ReportsController, handler, { params: { projectId: ' project_1 ' } })),
    ).resolves.toBe(true);

    expect(can.mock.calls[0]?.[0]).toMatchObject({
      permissions: ['reports.read'],
      resource: { type: 'project', id: 'project_1' },
    });
  });

  it.each([
    [
      'query',
      { type: 'project', idQuery: 'projectId' },
      { query: { projectId: 'project_1' } },
    ],
    [
      'header',
      { type: 'project', idHeader: 'x-project-id' },
      { headers: { 'x-project-id': 'project_1' } },
    ],
  ] satisfies Array<[string, NonNullable<RbacRequirementOptions['resource']>, Record<string, unknown>]>)(
    'resolves resources from built-in HTTP %s declarations',
    async (_source, resource, request) => {
      const can = vi.fn((input: RbacCanInput) => {
        void input;
        return Promise.resolve({
          allowed: true,
          reason: 'allowed_by_role_permission' as const,
        });
      });

      class ReportsController {
        @Can('reports.read', { resource })
        read() {
          return undefined;
        }
      }
      const handler = getHandler(ReportsController.prototype, 'read');
      const moduleRef = await Test.createTestingModule({
        providers: [
          Reflector,
          RbacGuard,
          { provide: RbacService, useValue: { can } },
          {
            provide: RBAC_OPTIONS,
            useValue: {
              storage: new InMemoryRbacStorage(),
              subjectResolver: () => subject,
            } satisfies RbacModuleOptions,
          },
        ],
      }).compile();

      await expect(
        moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler, request)),
      ).resolves.toBe(true);

      expect(can.mock.calls[0]?.[0]).toMatchObject({
        permissions: ['reports.read'],
        resource: { type: 'project', id: 'project_1' },
      });
    },
  );

  it('resolves resources from bare string resolver tokens', async () => {
    const RESOURCE_RESOLVER = 'RESOURCE_RESOLVER';
    const resolve = vi.fn(() => ({ type: 'report', id: 'report_1' }));
    const resourceResolver: RbacResourceResolver = { resolve };
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: RESOURCE_RESOLVER })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        { provide: RESOURCE_RESOLVER, useValue: resourceResolver },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).resolves.toBe(true);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(can.mock.calls[0]?.[0]).toMatchObject({
      permissions: ['reports.read'],
      resource: { type: 'report', id: 'report_1' },
    });
  });

  it('resolves resources from bare class resolver tokens', async () => {
    class ProjectResourceResolver implements RbacResourceResolver {
      resolve(context: ExecutionContext): RbacResourceRef {
        void context;
        return { type: 'project', id: 'project_1' };
      }
    }
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: ProjectResourceResolver })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        ProjectResourceResolver,
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).resolves.toBe(true);

    expect(can.mock.calls[0]?.[0]).toMatchObject({
      permissions: ['reports.read'],
      resource: { type: 'project', id: 'project_1' },
    });
  });

  it('throws RBAC_RESOURCE_MISSING when a function resource resolver returns undefined', async () => {
    const log = vi.fn<(event: RbacAuditEvent) => void>();
    const resourceResolver = vi.fn(() => undefined);
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: resourceResolver as unknown as RbacResourceResolverFn })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
            auditLogger: { log },
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expectResourceMissing(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    );
    expect(can).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({
      type: 'rbac.permission.denied',
      tenantId: 'tenant_1',
      subjectType: 'user',
      subjectId: 'user_1',
      metadata: { reason: 'denied_resource_missing' },
    });
  });

  it('throws RBAC_RESOURCE_MISSING when a function resource resolver returns null', async () => {
    const resourceResolver = vi.fn(() => null);
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: resourceResolver as unknown as RbacResourceResolverFn })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expectResourceMissing(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    );
    expect(can).not.toHaveBeenCalled();
  });

  it('throws RBAC_RESOURCE_MISSING when a function resource resolver returns malformed resources', async () => {
    const malformedResources = [
      {},
      { type: '', id: '' },
      { type: '   ', id: 'report_1' },
      { type: 'report' },
    ];

    for (const malformedResource of malformedResources) {
      const resourceResolver = vi.fn(() => malformedResource);
      const can = vi.fn((input: RbacCanInput) => {
        void input;
        return Promise.resolve({
          allowed: true,
          reason: 'allowed_by_role_permission' as const,
        });
      });

      class ReportsController {
        @Can('reports.read', { resource: resourceResolver as unknown as RbacResourceResolverFn })
        read() {
          return undefined;
        }
      }
      const handler = getHandler(ReportsController.prototype, 'read');
      const moduleRef = await Test.createTestingModule({
        providers: [
          Reflector,
          RbacGuard,
          { provide: RbacService, useValue: { can } },
          {
            provide: RBAC_OPTIONS,
            useValue: {
              storage: new InMemoryRbacStorage(),
              subjectResolver: () => subject,
            } satisfies RbacModuleOptions,
          },
        ],
      }).compile();

      await expectResourceMissing(
        moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
      );
      expect(can).not.toHaveBeenCalled();
    }
  });

  it('throws RBAC_RESOURCE_MISSING when a resolver token provider returns a malformed resource', async () => {
    const RESOURCE_RESOLVER = Symbol('RESOURCE_RESOLVER');
    const resolve = vi.fn(() => ({ type: 'report', id: '   ' }));
    const resourceResolver: RbacResourceResolver = { resolve };
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: { resolverToken: RESOURCE_RESOLVER } })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        { provide: RESOURCE_RESOLVER, useValue: resourceResolver },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expectResourceMissing(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    );
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(can).not.toHaveBeenCalled();
  });

  it('throws RBAC_RESOURCE_MISSING when a resolver token provider is not a resolver', async () => {
    const RESOURCE_RESOLVER = Symbol('RESOURCE_RESOLVER');
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: { resolverToken: RESOURCE_RESOLVER } })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        { provide: RESOURCE_RESOLVER, useValue: {} },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expectResourceMissing(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    );
    expect(can).not.toHaveBeenCalled();
  });

  it('throws RBAC_RESOURCE_MISSING when a resolver token provider is missing', async () => {
    const RESOURCE_RESOLVER = Symbol('MISSING_RESOURCE_RESOLVER');
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: { resolverToken: RESOURCE_RESOLVER } })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expectResourceMissing(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    );
    expect(can).not.toHaveBeenCalled();
  });

  it('passes valid function resource resolver output to RbacService', async () => {
    const resource = { type: 'report', id: 'report_1' };
    const resourceResolver = vi.fn(() => resource);
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: resourceResolver })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).resolves.toBe(true);

    expect(can.mock.calls[0]?.[0]).toMatchObject({
      permissions: ['reports.read'],
      resource,
    });
  });

  it('ignores unsupported resource metadata shapes defensively', async () => {
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read', { resource: 42 as unknown as RbacRequirementOptions['resource'] })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).resolves.toBe(true);

    expect(can.mock.calls[0]?.[0]).toEqual({
      subject,
      tenantId: 'tenant_1',
      tenantMode: 'optional',
      permissions: ['reports.read'],
      mode: 'any',
    });
  });

  it('maps missing tenant decisions to coded forbidden responses', async () => {
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: false,
        reason: 'denied_tenant_missing' as const,
      });
    });

    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).rejects.toMatchObject({
      response: {
        message: 'Tenant missing',
        code: 'RBAC_TENANT_MISSING',
      },
    });
  });

  it.each([
    ['denied_subject_missing' as const, 'Subject missing', 'RBAC_SUBJECT_MISSING'],
    ['denied_resource_missing' as const, 'Resource missing', 'RBAC_RESOURCE_MISSING'],
    ['denied_storage_error' as const, 'RBAC storage error', 'RBAC_STORAGE_ERROR'],
  ])('maps %s decisions to coded responses', async (reason, message, code) => {
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: false,
        reason,
      });
    });

    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).rejects.toMatchObject({
      response: { message, code },
    });
  });

  it('maps RBAC errors thrown by RbacService to coded HTTP responses', async () => {
    const can = vi.fn(() => {
      throw new RbacConfigError({ reason: 'bad test config' });
    });

    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).rejects.toMatchObject({
      response: {
        message: 'RBAC configuration error',
        code: 'RBAC_CONFIG_ERROR',
      },
    });
  });

  it('maps denied permission decisions to coded forbidden responses', async () => {
    const can = vi.fn((input: RbacCanInput) => {
      void input;
      return Promise.resolve({
        allowed: false,
        reason: 'denied_no_matching_permission' as const,
      });
    });

    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).rejects.toMatchObject({
      response: {
        message: 'Permission denied',
        code: 'RBAC_PERMISSION_DENIED',
      },
    });
  });

  it('logs denied permission decisions through the configured audit logger', async () => {
    const log = vi.fn<(event: RbacAuditEvent) => void>();
    const deniedSubject = {
      ...subject,
      attributes: { email: 'private@example.com' },
    };
    const can = vi.fn(() =>
      Promise.resolve({
        allowed: false,
        reason: 'denied_no_matching_permission' as const,
        subject: deniedSubject,
        tenantId: 'tenant_1',
        permission: 'reports.read',
        permissions: ['reports.read'],
        resource: { type: 'report', id: 'report_1' },
      }),
    );

    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => deniedSubject,
            auditLogger: { log },
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).rejects.toMatchObject({
      response: {
        message: 'Permission denied',
        code: 'RBAC_PERMISSION_DENIED',
      },
    });

    const [event] = log.mock.calls[0] ?? [];
    expect(event).toMatchObject({
      type: 'rbac.permission.denied',
      tenantId: 'tenant_1',
      subjectType: 'user',
      subjectId: 'user_1',
    });
    expect(event?.metadata).toMatchObject({
      reason: 'denied_no_matching_permission',
      permission: 'reports.read',
      permissions: ['reports.read'],
      resource: { type: 'report', id: 'report_1' },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.com');
  });

  it('logs allowed decisions only when configured', async () => {
    const log = vi.fn<(event: RbacAuditEvent) => void>();
    const can = vi.fn(() =>
      Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role_permission' as const,
        subject,
        tenantId: 'tenant_1',
        permission: 'reports.read',
        permissions: ['reports.read'],
        matchedRoleKeys: ['viewer'],
        matchedPermissions: ['reports.read'],
      }),
    );

    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
            auditLogger: { log },
            logAllowedDecisions: true,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).resolves.toBe(true);

    expect(log).toHaveBeenCalledWith({
      type: 'rbac.permission.allowed',
      tenantId: 'tenant_1',
      subjectType: 'user',
      subjectId: 'user_1',
      metadata: {
        reason: 'allowed_by_role_permission',
        permission: 'reports.read',
        permissions: ['reports.read'],
        matchedRoleKeys: ['viewer'],
        matchedPermissions: ['reports.read'],
      },
    });
  });

  it('logs allowed role decisions with resource metadata', async () => {
    const log = vi.fn<(event: RbacAuditEvent) => void>();
    const can = vi.fn(() =>
      Promise.resolve({
        allowed: true,
        reason: 'allowed_by_role' as const,
        subject,
        tenantId: 'tenant_1',
        roleKey: 'owner',
        resource: { type: 'project', id: 'project_1' },
      }),
    );

    class ReportsController {
      @RequireRole('owner', {
        resource: () => ({ type: 'project', id: 'project_1' }),
      })
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
            auditLogger: { log },
            logAllowedDecisions: true,
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).resolves.toBe(true);

    expect(log).toHaveBeenCalledWith({
      type: 'rbac.permission.allowed',
      tenantId: 'tenant_1',
      subjectType: 'user',
      subjectId: 'user_1',
      metadata: {
        reason: 'allowed_by_role',
        roleKey: 'owner',
        resource: { type: 'project', id: 'project_1' },
      },
    });
  });

  it('preserves denied RBAC responses when audit logging fails', async () => {
    const can = vi.fn(() =>
      Promise.resolve({
        allowed: false,
        reason: 'denied_no_matching_permission' as const,
        subject,
        tenantId: 'tenant_1',
        permission: 'reports.read',
      }),
    );

    class ReportsController {
      @Can('reports.read')
      read() {
        return undefined;
      }
    }
    const handler = getHandler(ReportsController.prototype, 'read');
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        RbacGuard,
        { provide: RbacService, useValue: { can } },
        {
          provide: RBAC_OPTIONS,
          useValue: {
            storage: new InMemoryRbacStorage(),
            subjectResolver: () => subject,
            auditLogger: { log: vi.fn(() => Promise.reject(new Error('audit unavailable'))) },
          } satisfies RbacModuleOptions,
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(RbacGuard).canActivate(contextFor(ReportsController, handler)),
    ).rejects.toMatchObject({
      response: {
        message: 'Permission denied',
        code: 'RBAC_PERMISSION_DENIED',
      },
    });
  });
});
