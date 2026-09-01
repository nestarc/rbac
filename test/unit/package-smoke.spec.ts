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

  it('declares the compatibility metadata without restricting 0.2.x Node installs', () => {
    const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      engines?: Record<string, string>;
      devDependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      peerDependenciesMeta: Record<string, { optional?: boolean }>;
      scripts: Record<string, string>;
    };

    expect(packageJson.engines).toBeUndefined();
    expect(packageJson.devDependencies['@types/node']).toBe('22.20.1');
    expect(packageJson.peerDependencies['@nestjs/common']).toBe('>=10 <12');
    expect(packageJson.peerDependencies['@nestjs/core']).toBe('>=10 <12');
    expect(packageJson.peerDependencies['@prisma/client']).toBe('>=5 <8');
    expect(packageJson.peerDependencies.prisma).toBe('>=5 <8');
    expect(packageJson.peerDependencies['reflect-metadata']).toBe('>=0.1.13');
    expect(packageJson.peerDependencies.rxjs).toBe('>=7');
    for (const optionalPeer of [
      '@prisma/client',
      'prisma',
      '@nestarc/tenancy',
      '@nestarc/api-keys',
      '@nestarc/audit-log',
    ]) {
      expect(packageJson.peerDependenciesMeta[optionalPeer]?.optional).toBe(true);
    }
    expect(packageJson.scripts['test:consumer:modern']).toContain(
      'scripts/verify-modern-consumer.cjs',
    );
  });

  it('declares exact lower-bound compatibility gates', () => {
    const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const ciWorkflowPath = fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url));
    const nest10RunnerPath = fileURLToPath(
      new URL('../../scripts/verify-nest10-consumer.cjs', import.meta.url),
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8');
    const nest10Runner = readFileSync(nest10RunnerPath, 'utf8');

    expect(packageJson.scripts['test:consumer:nest10']).toContain(
      'scripts/verify-nest10-consumer.cjs',
    );
    expect(nest10Runner).toContain("'@nestjs/common': '10.4.22'");
    expect(nest10Runner).toContain("'@nestjs/core': '10.4.22'");
    expect(nest10Runner).toContain("'--strict-peer-deps'");
    expect(nest10Runner).not.toContain("'--force'");
    expect(nest10Runner).not.toContain("'--legacy-peer-deps'");
    expect(ciWorkflow).toContain('Nest 10.4.22');
    expect(ciWorkflow).toContain('prisma-version: 5.22.0');
    expect(ciWorkflow).toContain('prisma-version: 6.19.3');
    expect(ciWorkflow).toContain('prisma-version: 7.10.0');
  });
});
