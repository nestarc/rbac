import { describe, expect, it, vi } from 'vitest';
import { PrismaRbacStorage, type PrismaRbacClientLike } from '../../src/prisma';

describe('PrismaRbacStorage indexed role lookup query', () => {
  it('queries one role id and its permissions without listing the role graph', async () => {
    const findFirst = vi.fn(() =>
      Promise.resolve({
        id: 'role_indexed',
        key: 'indexed_reader',
        name: 'Indexed reader',
        description: null,
        tenantId: 'tenant_1',
        isSystem: false,
        permissions: [{ permission: { key: 'reports.read' } }],
      }),
    );
    const findMany = vi.fn(() => Promise.resolve([]));
    const prisma = {
      rbacRole: { findFirst, findMany },
    } as unknown as PrismaRbacClientLike;
    const storage = new PrismaRbacStorage(prisma);

    await expect(storage.findRoleById({ roleId: ' role_indexed ' })).resolves.toEqual({
      id: 'role_indexed',
      key: 'indexed_reader',
      name: 'Indexed reader',
      tenantId: 'tenant_1',
      isSystem: false,
      permissions: ['reports.read'],
    });

    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'role_indexed' },
      include: { permissions: { include: { permission: true } } },
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
