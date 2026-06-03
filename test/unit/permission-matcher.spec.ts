import { describe, expect, it } from 'vitest';
import { assertNonEmptyString, matchesPermission, normalizePermissions } from '../../src';

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

  it.each([
    ['invoice.', 'invoice.read'],
    ['invoice.*', 'invoice.'],
    ['*.read', 'invoice.read'],
    ['invoice.read', '.read'],
  ])('rejects invalid matcher input %s against %s', (granted, required) => {
    expect(() => matchesPermission(granted, required)).toThrow('Invalid permission');
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

  it('accepts wildcard and supported segment characters', () => {
    expect(normalizePermissions(['*', 'Reports.Read_All', 'billing-plan.view_2026'])).toEqual([
      '*',
      'Reports.Read_All',
      'billing-plan.view_2026',
    ]);
  });

  it.each(['*.read', '.read', 'reports..read'])(
    'rejects invalid edge-case permission %s',
    (permission) => {
      expect(() => normalizePermissions([permission])).toThrow('Invalid permission');
    },
  );
});

describe('assertNonEmptyString', () => {
  it.each([undefined, null, '', ' '])('rejects empty value %s', (value) => {
    expect(() => assertNonEmptyString(value, 'permission')).toThrow(
      'permission must be a non-empty string',
    );
  });

  it('returns trimmed values for valid input', () => {
    expect(assertNonEmptyString(' reports.read ', 'permission')).toBe('reports.read');
  });
});
