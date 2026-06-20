import { describe, expect, expectTypeOf, it } from 'vitest';
import { RbacConfigError, defineRbacPermissions } from '../../src';

describe('defineRbacPermissions', () => {
  it('preserves nested permission literals and exposes a flattened permission list', () => {
    const permissions = defineRbacPermissions({
      reports: {
        read: 'reports.read',
        export: 'reports.export',
      },
      projects: {
        inviteMember: 'project.member.invite',
      },
    } as const);

    expect(permissions.reports.read).toBe('reports.read');
    expect(permissions.reports.export).toBe('reports.export');
    expect(permissions.projects.inviteMember).toBe('project.member.invite');
    expect(permissions.$permissions).toEqual([
      'reports.read',
      'reports.export',
      'project.member.invite',
    ]);
    expect(Object.keys(permissions)).toEqual(['reports', 'projects']);

    expectTypeOf(permissions.reports.read).toEqualTypeOf<'reports.read'>();
    expectTypeOf(permissions.$permission).toEqualTypeOf<
      'reports.read' | 'reports.export' | 'project.member.invite'
    >();
  });

  it('supports flat metadata permission contracts', () => {
    const permissions = defineRbacPermissions({
      'reports.read': {
        description: 'Read reports.',
        owner: 'reports',
      },
      'reports.export': {
        description: 'Export reports.',
        owner: 'reports',
        risk: 'sensitive',
      },
    } as const);

    expect(permissions['reports.read']).toBe('reports.read');
    expect(permissions['reports.export']).toBe('reports.export');
    expect(permissions.$permissions).toEqual(['reports.read', 'reports.export']);
    expect(permissions.$metadata).toEqual({
      'reports.read': {
        description: 'Read reports.',
        owner: 'reports',
      },
      'reports.export': {
        description: 'Export reports.',
        owner: 'reports',
        risk: 'sensitive',
      },
    });
    expect(Object.keys(permissions)).toEqual(['reports.read', 'reports.export']);
  });

  it('rejects duplicate permission values when duplicate validation is enabled', () => {
    expect(() =>
      defineRbacPermissions(
        {
          reports: {
            read: 'reports.read',
          },
          dashboards: {
            read: 'reports.read',
          },
        } as const,
        { validateDuplicates: true },
      ),
    ).toThrow(RbacConfigError);
  });
});
