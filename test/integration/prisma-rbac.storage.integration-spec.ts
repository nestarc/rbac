import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RbacService } from '../../src';
import { PrismaRbacStorage } from '../../src/prisma';
import type { PrismaRbacClientLike } from '../../src/prisma';
import { runRbacStorageContract } from '../contract/storage-contract';

const databaseUrl = process.env.RBAC_PRISMA_DATABASE_URL ?? process.env.DATABASE_URL;
const describePrisma = databaseUrl ? describe : describe.skip;
const isLegacyClient = process.env.RBAC_PRISMA_CLIENT === 'legacy';
const prismaClientModule = isLegacyClient
  ? await import('@prisma/client')
  : await import('./generated/client/client');
const prismaAdapterModule = isLegacyClient ? undefined : await import('@prisma/adapter-pg');

interface IntegrationPrismaClient extends PrismaRbacClientLike {
  $disconnect(): Promise<void>;
}

type PrismaClientConstructor = new (options?: Record<string, unknown>) => IntegrationPrismaClient;

const createPrismaClient = (): IntegrationPrismaClient => {
  const connectionString = databaseUrl ?? 'postgresql://rbac:rbac@127.0.0.1:5432/rbac_test';

  const { PrismaClient } = prismaClientModule as unknown as {
    PrismaClient: PrismaClientConstructor;
  };

  if (isLegacyClient) {
    return new PrismaClient({ datasources: { db: { url: connectionString } } });
  }

  const PrismaPg = prismaAdapterModule?.PrismaPg as new (options: {
    connectionString: string;
  }) => unknown;

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
};

describePrisma('PrismaRbacStorage', () => {
  const prisma = createPrismaClient();

  beforeEach(async () => {
    await prisma.rbacRoleBinding.deleteMany();
    await prisma.rbacRolePermission.deleteMany();
    await prisma.rbacPermission.deleteMany();
    await prisma.rbacRole.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  runRbacStorageContract({
    createStorage: () => new PrismaRbacStorage(prisma),
  });

  it('reactivates an expired unrevoked duplicate binding instead of inserting', async () => {
    const storage = new PrismaRbacStorage(prisma);
    const role = await storage.upsertRole({
      tenantId: 'tenant_1',
      key: 'reactivated_operator',
      permissions: ['projects.update'],
    });
    const subject = { type: 'user', id: 'user_reactivate', tenantId: 'tenant_1' };
    const expiredBinding = await storage.assignRole({
      tenantId: 'tenant_1',
      subject,
      roleId: role.id,
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
      metadata: { source: 'expired' },
    });

    const reactivatedBinding = await storage.assignRole({
      tenantId: 'tenant_1',
      subject,
      roleId: role.id,
      expiresAt: new Date('2999-01-01T00:00:00.000Z'),
      metadata: { source: 'reactivated' },
    });

    expect(reactivatedBinding).toMatchObject({
      id: expiredBinding.id,
      metadata: { source: 'reactivated' },
    });
    expect(reactivatedBinding.expiresAt?.toISOString()).toBe('2999-01-01T00:00:00.000Z');
    await expect(storage.listBindings({ tenantId: 'tenant_1', subject })).resolves.toHaveLength(1);
  });

  it('handles concurrent duplicate role upserts idempotently', async () => {
    const storage = new PrismaRbacStorage(prisma);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        storage.mutationResults.createRole({
          tenantId: 'tenant_1',
          key: 'concurrent_operator',
          permissions: ['projects.update'],
        }),
      ),
    );
    const roles = results.flatMap((result) => (result.value ? [result.value] : []));

    expect(results.filter((result) => result.outcome === 'created')).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'no-op')).toHaveLength(7);
    expect(new Set(roles.map((role) => role.id)).size).toBe(1);
    await expect(storage.listRoles({ tenantId: 'tenant_1' })).resolves.toHaveLength(1);
  });

  it('emits one service audit and change event for concurrent duplicate role creates', async () => {
    const storage = new PrismaRbacStorage(prisma);
    const log = vi.fn();
    const publish = vi.fn();
    const service = new RbacService({
      storage,
      auditLogger: { log },
      changePublisher: { publish },
    });
    const input = {
      tenantId: 'tenant_1',
      key: 'concurrent_event_operator',
      permissions: ['projects.update'],
    };

    await Promise.all(Array.from({ length: 8 }, () => service.createRole(input)));

    expect(log).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ type: 'rbac.role.created' }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'role.created' }));
  });

  it('handles concurrent duplicate role assignments idempotently', async () => {
    const storage = new PrismaRbacStorage(prisma);
    const role = await storage.upsertRole({
      tenantId: 'tenant_1',
      key: 'concurrent_binding_operator',
      permissions: ['projects.update'],
    });
    const subject = { type: 'user', id: 'user_concurrent', tenantId: 'tenant_1' };
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        storage.mutationResults.assignRole({
          tenantId: 'tenant_1',
          subject,
          roleId: role.id,
          metadata: { source: 'concurrent' },
        }),
      ),
    );
    const bindings = results.flatMap((result) => (result.value ? [result.value] : []));

    expect(results.filter((result) => result.outcome === 'created')).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'no-op')).toHaveLength(7);
    expect(new Set(bindings.map((binding) => binding.id)).size).toBe(1);
    await expect(storage.listBindings({ tenantId: 'tenant_1', subject })).resolves.toHaveLength(1);
  });

  it('reports one update for concurrent duplicate role revocations', async () => {
    const storage = new PrismaRbacStorage(prisma);
    const role = await storage.upsertRole({
      tenantId: 'tenant_1',
      key: 'concurrent_revocation_operator',
      permissions: [],
    });
    const binding = await storage.assignRole({
      tenantId: 'tenant_1',
      subject: { type: 'user', id: 'user_concurrent_revoke', tenantId: 'tenant_1' },
      roleId: role.id,
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        storage.mutationResults.revokeRole({
          bindingId: binding.id,
          revokedAt: new Date('2026-01-15T00:00:00.000Z'),
        }),
      ),
    );

    expect(results.filter((result) => result.outcome === 'updated')).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'no-op')).toHaveLength(7);
  });

  it('round-trips metadata objects that look like adapter markers', async () => {
    const storage = new PrismaRbacStorage(prisma);
    const role = await storage.upsertRole({
      tenantId: 'tenant_1',
      key: 'metadata_marker_reader',
      permissions: [],
    });
    const subject = { type: 'user', id: 'user_marker', tenantId: 'tenant_1' };
    const metadata = {
      __rbacDate: 'literal',
      nested: { __nestarcRbacJson: 'date', value: 'not an encoded date' },
    };

    await storage.assignRole({
      tenantId: 'tenant_1',
      subject,
      roleId: role.id,
      metadata,
    });

    await expect(storage.listBindings({ tenantId: 'tenant_1', subject })).resolves.toEqual([
      expect.objectContaining({ metadata }),
    ]);
  });
});
