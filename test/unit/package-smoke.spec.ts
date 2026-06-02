import { describe, expect, it } from 'vitest';
import { RBAC_OPTIONS } from '../../src';

describe('package exports', () => {
  it('exports provider tokens', () => {
    expect(typeof RBAC_OPTIONS).toBe('symbol');
  });
});
