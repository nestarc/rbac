import { describe, expect, it } from 'vitest';
import { matchesPermission, normalizePermissions } from '../../src';

describe('matchesPermission', () => {
  it.each([
    ['invoice.read', 'invoice.read', true],
    ['invoice.*', 'invoice.read', true],
    ['invoice.*', 'invoice.write', true],
    ['*', 'tenant.delete', true],
    ['invoice.write', 'invoice.read', false],
    ['invoice.*', 'invoices.read', false],
    ['invoice.read', 'invoice.read.all', false],
  ])('matches %s against %s as %s', (granted, required, expected) => {
    expect(matchesPermission(granted, required)).toBe(expected);
  });
});

describe('normalizePermissions', () => {
  it('deduplicates and trims permission input', () => {
    expect(normalizePermissions([' reports.read ', 'reports.read', 'reports.*'])).toEqual([
      'reports.read',
      'reports.*',
    ]);
  });

  it.each(['', ' ', 'reports*', 'reports.*.read', 'reports.'])(
    'rejects invalid permission %s',
    (permission) => {
      expect(() => normalizePermissions([permission])).toThrow('Invalid permission');
    },
  );
});
