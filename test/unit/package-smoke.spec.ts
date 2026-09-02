import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
    const ciWorkflowPath = fileURLToPath(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
    );
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

  it('typechecks every shipped TypeScript example from the packed consumer', () => {
    const modernConsumerPath = fileURLToPath(
      new URL('../../scripts/verify-modern-consumer.cjs', import.meta.url),
    );
    const ciWorkflowPath = fileURLToPath(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
    );
    const releaseWorkflowPath = fileURLToPath(
      new URL('../../.github/workflows/release.yml', import.meta.url),
    );
    const modernConsumer = readFileSync(modernConsumerPath, 'utf8');
    const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8');
    const releaseWorkflow = readFileSync(releaseWorkflowPath, 'utf8');

    expect(modernConsumer).toContain("include: ['examples/**/*.ts']");
    expect(modernConsumer).toContain('Packed RBAC package did not contain any TypeScript example');
    expect(modernConsumer).toContain('Shipped examples TypeScript smoke');
    expect(ciWorkflow).toContain('packed consumer, shipped examples');
    expect(releaseWorkflow).toContain('packed consumer, shipped examples');
  });

  it('pins advisory overrides to the affected parent tool versions', () => {
    const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const packageLockPath = fileURLToPath(new URL('../../package-lock.json', import.meta.url));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      overrides: Record<string, Record<string, string>>;
    };
    const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8')) as {
      packages: Record<string, { version?: string }>;
    };

    expect(packageJson.overrides).toEqual({
      tsup: { esbuild: '0.28.2' },
      '@prisma/config@7.10.0': { 'deepmerge-ts': '8.0.2' },
    });
    expect(packageLock.packages['node_modules/esbuild']?.version).toBe('0.28.2');
    expect(packageLock.packages['node_modules/deepmerge-ts']?.version).toBe('8.0.2');
  });

  it('blocks release publish on compatibility parity and main/tag ancestry', () => {
    const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const releaseWorkflowPath = fileURLToPath(
      new URL('../../.github/workflows/release.yml', import.meta.url),
    );
    const releaseTargetRunnerPath = fileURLToPath(
      new URL('../../scripts/verify-release-target.cjs', import.meta.url),
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const releaseWorkflow = readFileSync(releaseWorkflowPath, 'utf8');
    const releaseTargetRunner = readFileSync(releaseTargetRunnerPath, 'utf8');

    expect(packageJson.scripts['verify:release-target']).toContain(
      'scripts/verify-release-target.cjs',
    );
    expect(releaseTargetRunner).toContain("'merge-base', '--is-ancestor'");
    expect(releaseTargetRunner).toContain('refs/remotes/origin/main');
    expect(releaseWorkflow).toContain('fetch-depth: 0');
    expect(releaseWorkflow).toContain('RELEASE_TARGET_COMMITISH');
    expect(releaseWorkflow).toMatch(/node-version:\n\s+- 22\n\s+- 24/);
    expect(releaseWorkflow).toContain('node-version: 24');
    expect(releaseWorkflow).toContain('Nest 10.4.22');
    expect(releaseWorkflow).toContain('prisma-version: 5.22.0');
    expect(releaseWorkflow).toContain('prisma-version: 6.19.3');
    expect(releaseWorkflow).toContain('prisma-version: 7.10.0');
    expect(releaseWorkflow).toMatch(
      /publish:\n[\s\S]*?needs:\n\s+- release-target\n\s+- verify\n\s+- modern-consumer\n\s+- nest10-consumer\n\s+- prisma-integration/,
    );
  });

  it('verifies the release checkout and ancestry graph', () => {
    const releaseTargetModule = createRequire(import.meta.url)(
      '../../scripts/verify-release-target.cjs',
    ) as {
      verifyReleaseTarget(input: {
        tagName: string;
        targetCommitish: string;
        packageVersion: string;
        git: (args: string[]) => string;
      }): { tagCommit: string; targetCommit: string; mainCommit: string };
    };
    const verifyReleaseTarget = (
      input: Parameters<typeof releaseTargetModule.verifyReleaseTarget>[0],
    ) => releaseTargetModule.verifyReleaseTarget(input);
    const commits = new Map([
      ['refs/tags/v0.2.1', 'tag-commit'],
      ['HEAD', 'tag-commit'],
      ['refs/remotes/origin/main', 'main-commit'],
    ]);
    const ancestry = new Set(['tag-commit:main-commit', 'main-commit:main-commit']);
    const git = (args: string[]) => {
      if (args[0] === 'rev-parse') {
        const ref = args.at(-1)?.replace(/\^\{commit\}$/, '');
        const commit = ref ? commits.get(ref) : undefined;
        if (commit) return commit;
      }
      if (args[0] === 'merge-base' && ancestry.has(`${args[2]}:${args[3]}`)) return '';
      throw new Error(`Rejected git call: ${args.join(' ')}`);
    };

    expect(
      verifyReleaseTarget({
        tagName: 'v0.2.1',
        targetCommitish: 'main',
        packageVersion: '0.2.1',
        git,
      }),
    ).toMatchObject({
      tagCommit: 'tag-commit',
      targetCommit: 'main-commit',
      mainCommit: 'main-commit',
    });
    expect(
      verifyReleaseTarget({
        tagName: 'v0.2.1',
        targetCommitish: 'refs/heads/main',
        packageVersion: '0.2.1',
        git,
      }),
    ).toMatchObject({ targetCommit: 'main-commit' });
    expect(() =>
      verifyReleaseTarget({
        tagName: 'v0.2.2',
        targetCommitish: 'main',
        packageVersion: '0.2.1',
        git,
      }),
    ).toThrow('does not match package.json version');
    expect(() =>
      verifyReleaseTarget({
        tagName: '../v0.2.1',
        targetCommitish: 'main',
        packageVersion: '0.2.1',
        git,
      }),
    ).toThrow('is not a safe Git ref or commit');
    expect(() =>
      verifyReleaseTarget({
        tagName: 'v0.2.1',
        targetCommitish: 'main',
        packageVersion: '0.2.1',
        git: (args) => (args.at(-1) === 'HEAD^{commit}' ? 'other-commit' : git(args)),
      }),
    ).toThrow('does not match tag commit');
  });
});
