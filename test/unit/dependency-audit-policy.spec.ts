import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const auditPolicy = createRequire(import.meta.url)('../../scripts/verify-dependency-audit.cjs') as {
  verifyProductionReport(report: unknown): void;
  verifyFullReport(report: unknown, exceptions: unknown[], today: string): void;
  verifyOverrideExceptions(packageJson: unknown, exceptions: unknown[], today: string): void;
};

const activeFields = {
  owner: 'repository-maintainers',
  reviewBy: '2026-10-02',
  reason: 'Development-only fixture.',
  removeWhen: 'Remove when the parent tool is fixed.',
};

const fullReport = {
  vulnerabilities: {
    mysql2: {
      severity: 'high',
      isDirect: false,
      via: [{ source: 1153173 }],
      effects: ['prisma'],
      range: '<3.22.0',
      nodes: ['node_modules/mysql2'],
    },
  },
};

const auditException = {
  id: 'GHSA-fixture',
  package: 'mysql2',
  severity: 'high',
  isDirect: false,
  range: '<3.22.0',
  via: ['advisory:1153173'],
  effects: ['prisma'],
  nodes: ['node_modules/mysql2'],
  ...activeFields,
};

describe('dependency audit policy', () => {
  it('requires a zero-vulnerability production report', () => {
    expect(() =>
      auditPolicy.verifyProductionReport({
        vulnerabilities: {},
        metadata: { vulnerabilities: { total: 0 } },
      }),
    ).not.toThrow();
    expect(() =>
      auditPolicy.verifyProductionReport({
        vulnerabilities: { mysql2: {} },
        metadata: { vulnerabilities: { total: 1 } },
      }),
    ).toThrow(/zero vulnerabilities/);
  });

  it('pins every workflow action and limits OIDC permission to publishing', () => {
    const workflowsDirectory = fileURLToPath(new URL('../../.github/workflows/', import.meta.url));
    const workflows = readdirSync(workflowsDirectory)
      .filter((name) => name.endsWith('.yml'))
      .map((name) => ({ name, contents: readFileSync(`${workflowsDirectory}/${name}`, 'utf8') }));
    const actionRefs = workflows.flatMap((workflow) =>
      [...workflow.contents.matchAll(/^\s*uses:\s*[^@\s]+@([^\s#]+)/gm)]
        .map((match) => match[1])
        .filter((reference): reference is string => reference !== undefined),
    );
    const ciWorkflow = workflows.find(({ name }) => name === 'ci.yml')?.contents ?? '';
    const releaseWorkflow = workflows.find(({ name }) => name === 'release.yml')?.contents ?? '';
    const verificationWorkflow =
      workflows.find(({ name }) => name === 'verification.yml')?.contents ?? '';

    expect(actionRefs.length).toBeGreaterThan(0);
    expect(actionRefs.every((reference) => /^[a-f0-9]{40}$/.test(reference))).toBe(true);
    expect(ciWorkflow).not.toContain('id-token: write');
    expect(verificationWorkflow).not.toContain('id-token: write');
    expect(releaseWorkflow.match(/id-token: write/g)).toHaveLength(1);
    expect(releaseWorkflow).toMatch(
      /publish:\n[\s\S]*?permissions:\n\s+contents: read\n\s+id-token: write/,
    );
  });

  it('reuses the verification graph and bounds every executable job', () => {
    const ciWorkflow = readFileSync(
      fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)),
      'utf8',
    );
    const releaseWorkflow = readFileSync(
      fileURLToPath(new URL('../../.github/workflows/release.yml', import.meta.url)),
      'utf8',
    );
    const verificationWorkflow = readFileSync(
      fileURLToPath(new URL('../../.github/workflows/verification.yml', import.meta.url)),
      'utf8',
    );

    expect(ciWorkflow).toContain('uses: ./.github/workflows/verification.yml');
    expect(releaseWorkflow).toContain('uses: ./.github/workflows/verification.yml');
    expect(verificationWorkflow.match(/runs-on: ubuntu-latest/g)).toHaveLength(7);
    expect(verificationWorkflow.match(/timeout-minutes:/g)).toHaveLength(7);
    expect(releaseWorkflow.match(/runs-on: ubuntu-latest/g)).toHaveLength(2);
    expect(releaseWorkflow.match(/timeout-minutes:/g)).toHaveLength(2);
    expect(verificationWorkflow.match(/run: npm run build/g)).toHaveLength(1);
    expect(verificationWorkflow).toMatch(
      /Generate modern Prisma client\n\s+if: matrix\.client == 'modern'/,
    );
    expect(verificationWorkflow).toMatch(
      /Generate legacy Prisma client\n\s+if: matrix\.client == 'legacy'/,
    );
  });

  it('groups dependency updates by compatibility stack', () => {
    const dependabot = readFileSync(
      fileURLToPath(new URL('../../.github/dependabot.yml', import.meta.url)),
      'utf8',
    );

    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('nestjs:');
    expect(dependabot).toContain('prisma:');
    expect(dependabot).toContain('lint-test:');
    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('actions:');
  });

  it('accepts only an exact active full-audit exception', () => {
    expect(() =>
      auditPolicy.verifyFullReport(fullReport, [auditException], '2026-09-02'),
    ).not.toThrow();
    expect(() =>
      auditPolicy.verifyFullReport(
        {
          vulnerabilities: {
            ...fullReport.vulnerabilities,
            unexpected: {
              severity: 'low',
              isDirect: false,
              via: [],
              effects: [],
              range: '*',
              nodes: ['node_modules/unexpected'],
            },
          },
        },
        [auditException],
        '2026-09-02',
      ),
    ).toThrow(/do not match the risk register/);
  });

  it('fails on the review date and on changed advisory details', () => {
    expect(() => auditPolicy.verifyFullReport(fullReport, [auditException], '2026-10-02')).toThrow(
      /expired/,
    );
    expect(() =>
      auditPolicy.verifyFullReport(
        { vulnerabilities: { mysql2: { ...fullReport.vulnerabilities.mysql2, range: '<4' } } },
        [auditException],
        '2026-09-02',
      ),
    ).toThrow(/finding for mysql2 changed/);
  });

  it('requires every package override to have an active exact register entry', () => {
    const overrideException = {
      id: 'RBAC-fixture',
      selector: 'parent@1',
      package: 'child',
      version: '2.0.0',
      ...activeFields,
    };
    expect(() =>
      auditPolicy.verifyOverrideExceptions(
        { overrides: { 'parent@1': { child: '2.0.0' } } },
        [overrideException],
        '2026-09-02',
      ),
    ).not.toThrow();
    expect(() =>
      auditPolicy.verifyOverrideExceptions(
        { overrides: { 'parent@1': { child: '2.0.1' } } },
        [overrideException],
        '2026-09-02',
      ),
    ).toThrow(/do not match the risk register/);
  });
});
