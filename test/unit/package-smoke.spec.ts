import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(packageJson.peerDependencies['@nestjs/common']).toBe('>=10 <13');
    expect(packageJson.peerDependencies['@nestjs/core']).toBe('>=10 <13');
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
    expect(packageJson.scripts['test:consumer:modern:artifact']).toContain(
      'scripts/verify-modern-consumer.cjs',
    );
  });

  it('declares exact Nest compatibility gates', () => {
    const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const verificationWorkflowPath = fileURLToPath(
      new URL('../../.github/workflows/verification.yml', import.meta.url),
    );
    const nest10RunnerPath = fileURLToPath(
      new URL('../../scripts/verify-nest10-consumer.cjs', import.meta.url),
    );
    const nest12RunnerPath = fileURLToPath(
      new URL('../../scripts/verify-nest12-consumer.cjs', import.meta.url),
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const verificationWorkflow = readFileSync(verificationWorkflowPath, 'utf8');
    const nest10Runner = readFileSync(nest10RunnerPath, 'utf8');
    const nest12Runner = readFileSync(nest12RunnerPath, 'utf8');

    expect(packageJson.scripts['test:consumer:nest10:artifact']).toContain(
      'scripts/verify-nest10-consumer.cjs',
    );
    expect(nest10Runner).toContain("runnerName === 'verify-nest12-consumer.cjs'");
    expect(nest10Runner).toContain("? '12.0.1'");
    expect(nest10Runner).toContain("? '10.4.22'");
    expect(nest12Runner).toContain("require('./verify-nest10-consumer.cjs')");
    expect(nest10Runner).toContain("'--strict-peer-deps'");
    expect(nest10Runner).not.toContain("'--force'");
    expect(nest10Runner).not.toContain("'--legacy-peer-deps'");
    expect(packageJson.scripts['test:consumer:nest12:artifact']).toContain(
      'scripts/verify-nest12-consumer.cjs',
    );
    expect(verificationWorkflow).toContain('Nest 10.4.22');
    expect(verificationWorkflow).toContain('Nest 12.0.1');
    expect(verificationWorkflow).toContain('prisma-version: 5.22.0');
    expect(verificationWorkflow).toContain('prisma-version: 6.19.3');
    expect(verificationWorkflow).toContain('prisma-version: 7.10.0');
  });

  it('typechecks every shipped TypeScript example from the packed consumer', () => {
    const modernConsumerPath = fileURLToPath(
      new URL('../../scripts/verify-modern-consumer.cjs', import.meta.url),
    );
    const verificationWorkflowPath = fileURLToPath(
      new URL('../../.github/workflows/verification.yml', import.meta.url),
    );
    const modernConsumer = readFileSync(modernConsumerPath, 'utf8');
    const verificationWorkflow = readFileSync(verificationWorkflowPath, 'utf8');

    expect(modernConsumer).toContain("include: ['examples/**/*.ts']");
    expect(modernConsumer).toContain('Packed RBAC package did not contain any TypeScript example');
    expect(modernConsumer).toContain('Shipped examples TypeScript smoke');
    expect(verificationWorkflow).toContain('packed consumer, shipped examples');
  });

  it('builds one allowlisted package candidate for every public subpath and publish', () => {
    const packageJson = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
    ) as { exports: Record<string, unknown>; scripts: Record<string, string> };
    const policy = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../.github/package-contract.json', import.meta.url)),
        'utf8',
      ),
    ) as { maxTarballBytes: number; maxUnpackedBytes: number };
    const modernConsumer = readFileSync(
      fileURLToPath(new URL('../../scripts/verify-modern-consumer.cjs', import.meta.url)),
      'utf8',
    );
    const verificationWorkflow = readFileSync(
      fileURLToPath(new URL('../../.github/workflows/verification.yml', import.meta.url)),
      'utf8',
    );
    const releaseWorkflow = readFileSync(
      fileURLToPath(new URL('../../.github/workflows/release.yml', import.meta.url)),
      'utf8',
    );
    const publicSubpaths = [
      '.',
      './prisma',
      './testing',
      './integrations/tenancy',
      './integrations/api-keys',
      './integrations/audit-log',
    ];

    expect(Object.keys(packageJson.exports)).toEqual(publicSubpaths);
    expect(policy.maxTarballBytes).toBe(300_000);
    expect(policy.maxUnpackedBytes).toBe(1_500_000);
    expect(packageJson.scripts['package:prepare']).toContain('prepare-package.cjs');
    expect(packageJson.scripts['package:verify']).toContain('verify-package-artifact.cjs');
    expect(packageJson.scripts['verify:published-package']).toContain(
      'verify-published-package.cjs',
    );
    expect(modernConsumer).not.toContain("['pack'");
    for (const subpath of publicSubpaths.slice(1)) {
      expect(modernConsumer).toContain(`@nestarc/rbac/${subpath.slice(2)}`);
    }
    expect(verificationWorkflow.match(/Create and verify package once/g)).toHaveLength(1);
    expect(verificationWorkflow).toContain('name: rbac-package');
    expect(releaseWorkflow).toContain('name: rbac-package');
    expect(releaseWorkflow).toContain('npm publish "${{ steps.package.outputs.tarball }}"');
    expect(releaseWorkflow).toContain('--provenance');
    expect(releaseWorkflow).toContain('npm run verify:published-package');
  });

  it('requires published bytes and SLSA provenance to match the package manifest', () => {
    const publishedVerifier = createRequire(import.meta.url)(
      '../../scripts/verify-published-package.cjs',
    ) as {
      verifyPublishedDist(dist: unknown, manifest: unknown): void;
    };
    const manifest = {
      integrity: 'sha512-fixture',
      shasum: 'sha1-fixture',
      entryCount: 79,
      unpackedSize: 1_251_602,
    };
    const dist = {
      integrity: manifest.integrity,
      shasum: manifest.shasum,
      fileCount: manifest.entryCount,
      unpackedSize: manifest.unpackedSize,
      attestations: {
        url: 'https://registry.npmjs.org/-/npm/v1/attestations/package@1.0.0',
        provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
      },
    };

    expect(() => publishedVerifier.verifyPublishedDist(dist, manifest)).not.toThrow();
    expect(() =>
      publishedVerifier.verifyPublishedDist({ ...dist, integrity: 'sha512-other' }, manifest),
    ).toThrow(/integrity/);
    expect(() =>
      publishedVerifier.verifyPublishedDist({ ...dist, fileCount: 78 }, manifest),
    ).toThrow(/file metadata/);
    expect(() =>
      publishedVerifier.verifyPublishedDist({ ...dist, attestations: undefined }, manifest),
    ).toThrow(/provenance/);
    expect(() =>
      publishedVerifier.verifyPublishedDist(
        {
          ...dist,
          attestations: {
            ...dist.attestations,
            provenance: { predicateType: 'https://slsa.dev/provenance/v0.2' },
          },
        },
        manifest,
      ),
    ).toThrow(/provenance/);
  });

  it('loads only untampered package candidates from a strict manifest', () => {
    const packageCandidate = createRequire(import.meta.url)(
      '../../scripts/package-candidate.cjs',
    ) as {
      loadPackageCandidate(
        args: string[],
        cwd: string,
      ): { manifest: { filename: string }; tarballPath: string };
      parseOption(args: string[], name: string): string | undefined;
    };
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'rbac-package-candidate-'));
    const packageDirectory = join(fixtureRoot, 'package');
    const tarballPath = join(packageDirectory, 'rbac-fixture.tgz');
    const manifestPath = join(packageDirectory, 'package-contract.json');
    const tarball = Buffer.from('verified package bytes');
    mkdirSync(packageDirectory);
    writeFileSync(tarballPath, tarball);
    writeFileSync(
      manifestPath,
      `${JSON.stringify({
        schemaVersion: 1,
        name: '@nestarc/rbac',
        version: '0.2.1',
        filename: 'rbac-fixture.tgz',
        integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`,
        shasum: createHash('sha1').update(tarball).digest('hex'),
        size: tarball.length,
        unpackedSize: 42,
        entryCount: 1,
        files: ['package.json'],
      })}\n`,
    );

    try {
      const candidate = packageCandidate.loadPackageCandidate(
        ['--package-dir', packageDirectory],
        fixtureRoot,
      );
      expect(candidate.manifest.filename).toBe('rbac-fixture.tgz');
      expect(candidate.tarballPath).toBe(tarballPath);
      expect(packageCandidate.parseOption([], '--manifest')).toBeUndefined();
      expect(() => packageCandidate.parseOption(['--manifest'], '--manifest')).toThrow(
        /requires a value/,
      );
      expect(() =>
        packageCandidate.loadPackageCandidate(
          ['--package-dir', packageDirectory, '--manifest', manifestPath],
          fixtureRoot,
        ),
      ).toThrow(/either/);

      writeFileSync(tarballPath, 'tampered bytes');
      expect(() =>
        packageCandidate.loadPackageCandidate(['--manifest', manifestPath], fixtureRoot),
      ).toThrow(/do not match/);

      writeFileSync(
        manifestPath,
        `${JSON.stringify({
          schemaVersion: 1,
          name: '@nestarc/rbac',
          version: '0.2.1',
          filename: '../unsafe.tgz',
          integrity: 'sha512-fixture',
          shasum: 'fixture',
          size: 1,
          unpackedSize: 1,
          entryCount: 0,
          files: [],
        })}\n`,
      );
      expect(() =>
        packageCandidate.loadPackageCandidate(['--manifest', manifestPath], fixtureRoot),
      ).toThrow(/Unsafe/);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
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
    const verificationWorkflowPath = fileURLToPath(
      new URL('../../.github/workflows/verification.yml', import.meta.url),
    );
    const releaseTargetRunnerPath = fileURLToPath(
      new URL('../../scripts/verify-release-target.cjs', import.meta.url),
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const releaseWorkflow = readFileSync(releaseWorkflowPath, 'utf8');
    const verificationWorkflow = readFileSync(verificationWorkflowPath, 'utf8');
    const releaseTargetRunner = readFileSync(releaseTargetRunnerPath, 'utf8');

    expect(packageJson.scripts['verify:release-target']).toContain(
      'scripts/verify-release-target.cjs',
    );
    expect(releaseTargetRunner).toContain("'merge-base', '--is-ancestor'");
    expect(releaseTargetRunner).toContain('refs/remotes/origin/main');
    expect(releaseWorkflow).toContain('fetch-depth: 0');
    expect(releaseWorkflow).toContain('RELEASE_TARGET_COMMITISH');
    expect(verificationWorkflow).toMatch(/node-version:\n\s+- 22\n\s+- 24/);
    expect(releaseWorkflow).toContain('node-version: 24');
    expect(verificationWorkflow).toContain('Nest 10.4.22');
    expect(verificationWorkflow).toContain('prisma-version: 5.22.0');
    expect(verificationWorkflow).toContain('prisma-version: 6.19.3');
    expect(verificationWorkflow).toContain('prisma-version: 7.10.0');
    expect(releaseWorkflow).toMatch(
      /publish:\n[\s\S]*?needs:\n\s+- release-target\n\s+- verification/,
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
