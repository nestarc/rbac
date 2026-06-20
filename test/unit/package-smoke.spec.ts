import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RBAC_OPTIONS,
  RBAC_REQUIREMENTS_METADATA,
  RBAC_SKIP_METADATA,
  RBAC_STORAGE,
  RBAC_SUBJECT_REQUEST_KEY,
} from '../../src';

describe('package exports', () => {
  it('exports provider tokens', () => {
    expect(typeof RBAC_OPTIONS).toBe('symbol');
    expect(typeof RBAC_STORAGE).toBe('symbol');
    expect(typeof RBAC_REQUIREMENTS_METADATA).toBe('symbol');
    expect(typeof RBAC_SKIP_METADATA).toBe('symbol');
  });

  it('exports request subject key', () => {
    expect(RBAC_SUBJECT_REQUEST_KEY).toBe('rbacSubject');
  });

  it('declares the audit-log integration subpath export', () => {
    const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      exports: Record<string, unknown>;
    };

    expect(packageJson.exports).toHaveProperty('./integrations/audit-log');
  });
});
