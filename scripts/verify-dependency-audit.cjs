/* v8 ignore file -- policy behavior is covered by focused contract tests. */

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertActive(exception, today) {
  requireText(exception.id, 'Exception id');
  requireText(exception.owner, `Exception ${exception.id} owner`);
  requireText(exception.reason, `Exception ${exception.id} reason`);
  requireText(exception.removeWhen, `Exception ${exception.id} removeWhen`);
  const parsedReviewDate =
    typeof exception.reviewBy === 'string'
      ? new Date(`${exception.reviewBy}T00:00:00Z`)
      : undefined;
  if (
    typeof exception.reviewBy !== 'string' ||
    !DATE_PATTERN.test(exception.reviewBy) ||
    parsedReviewDate === undefined ||
    Number.isNaN(parsedReviewDate.getTime()) ||
    parsedReviewDate.toISOString().slice(0, 10) !== exception.reviewBy
  ) {
    throw new Error(`Exception ${exception.id} reviewBy must use YYYY-MM-DD.`);
  }
  if (exception.reviewBy <= today) {
    throw new Error(
      `Exception ${exception.id} expired on ${exception.reviewBy}; renew or remove it after review.`,
    );
  }
}

function normalizeVia(via) {
  return sorted(
    (Array.isArray(via) ? via : []).map((entry) =>
      typeof entry === 'string' ? `dependency:${entry}` : `advisory:${entry.source}`,
    ),
  );
}

function normalizeFinding(packageName, finding) {
  return {
    package: packageName,
    severity: finding.severity,
    isDirect: finding.isDirect,
    range: finding.range,
    via: normalizeVia(finding.via),
    effects: sorted(Array.isArray(finding.effects) ? finding.effects : []),
    nodes: sorted(Array.isArray(finding.nodes) ? finding.nodes : []),
  };
}

function normalizeAuditException(exception) {
  return {
    package: exception.package,
    severity: exception.severity,
    isDirect: exception.isDirect,
    range: exception.range,
    via: sorted(Array.isArray(exception.via) ? exception.via : []),
    effects: sorted(Array.isArray(exception.effects) ? exception.effects : []),
    nodes: sorted(Array.isArray(exception.nodes) ? exception.nodes : []),
  };
}

function verifyProductionReport(report) {
  const findings = Object.keys(report?.vulnerabilities ?? {});
  const total = report?.metadata?.vulnerabilities?.total;
  if (findings.length !== 0 || total !== 0) {
    throw new Error(
      `Production audit must contain zero vulnerabilities; found ${findings.length} entries (metadata total ${String(total)}).`,
    );
  }
}

function verifyFullReport(report, auditExceptions, today) {
  if (!Array.isArray(auditExceptions)) {
    throw new Error('auditExceptions must be an array.');
  }

  const expectedByPackage = new Map();
  for (const exception of auditExceptions) {
    assertActive(exception, today);
    requireText(exception.package, `Exception ${exception.id} package`);
    if (expectedByPackage.has(exception.package)) {
      throw new Error(`Duplicate audit exception for package ${exception.package}.`);
    }
    expectedByPackage.set(exception.package, exception);
  }

  const findings = report?.vulnerabilities ?? {};
  const actualPackages = sorted(Object.keys(findings));
  const expectedPackages = sorted(expectedByPackage.keys());
  if (JSON.stringify(actualPackages) !== JSON.stringify(expectedPackages)) {
    throw new Error(
      `Full audit packages do not match the risk register. Expected ${expectedPackages.join(', ') || 'none'}; found ${actualPackages.join(', ') || 'none'}.`,
    );
  }

  for (const packageName of actualPackages) {
    const actual = normalizeFinding(packageName, findings[packageName]);
    const expected = normalizeAuditException(expectedByPackage.get(packageName));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Full audit finding for ${packageName} changed. Expected ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.`,
      );
    }
  }
}

function flattenOverrides(overrides) {
  const leaves = [];
  for (const [selector, dependencies] of Object.entries(overrides ?? {})) {
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
      throw new Error(`Override ${selector} must contain dependency versions.`);
    }
    for (const [packageName, version] of Object.entries(dependencies)) {
      leaves.push({ selector, package: packageName, version });
    }
  }
  return leaves.sort((left, right) =>
    `${left.selector}:${left.package}`.localeCompare(`${right.selector}:${right.package}`),
  );
}

function verifyOverrideExceptions(packageJson, overrideExceptions, today) {
  if (!Array.isArray(overrideExceptions)) {
    throw new Error('overrideExceptions must be an array.');
  }
  for (const exception of overrideExceptions) {
    assertActive(exception, today);
    requireText(exception.selector, `Exception ${exception.id} selector`);
    requireText(exception.package, `Exception ${exception.id} package`);
    requireText(exception.version, `Exception ${exception.id} version`);
  }

  const actual = flattenOverrides(packageJson.overrides);
  const expected = overrideExceptions
    .map(({ selector, package: packageName, version }) => ({
      selector,
      package: packageName,
      version,
    }))
    .sort((left, right) =>
      `${left.selector}:${left.package}`.localeCompare(`${right.selector}:${right.package}`),
    );
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `package.json overrides do not match the risk register. Expected ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.`,
    );
  }
}

function runNpmAudit(args, label) {
  const result = spawnSync('npm', ['audit', ...args, '--json'], {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.write(`[audit:${label}] npm audit exit=${String(result.status)}\n`);
  process.stdout.write(result.stdout || '');
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`${label} npm audit failed to produce a policy-checkable result.`);
  }
  try {
    return { report: JSON.parse(result.stdout), status: result.status };
  } catch {
    throw new Error(`${label} npm audit did not return valid JSON.`);
  }
}

function currentPolicyDate() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${value.year}-${value.month}-${value.day}`;
}

if (require.main === module) {
  try {
    const root = resolve(__dirname, '..');
    const riskRegister = JSON.parse(
      readFileSync(resolve(root, '.github/dependency-risk-register.json'), 'utf8'),
    );
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const today = currentPolicyDate();
    if (riskRegister.version !== 1) {
      throw new Error(
        `Unsupported dependency risk register version: ${String(riskRegister.version)}.`,
      );
    }

    const production = runNpmAudit(['--omit=dev'], 'production');
    if (production.status !== 0) {
      throw new Error('Production npm audit exited nonzero.');
    }
    verifyProductionReport(production.report);

    const full = runNpmAudit([], 'full');
    verifyFullReport(full.report, riskRegister.auditExceptions, today);
    verifyOverrideExceptions(packageJson, riskRegister.overrideExceptions, today);
    process.stdout.write(
      `Dependency audit policy passed: production=0, approved full findings=${riskRegister.auditExceptions.length}, tracked overrides=${riskRegister.overrideExceptions.length}.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  verifyProductionReport,
  verifyFullReport,
  verifyOverrideExceptions,
};
