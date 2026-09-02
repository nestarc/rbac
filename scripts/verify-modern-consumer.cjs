'use strict';

const fs = require('node:fs');
const { createHash } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const packageJson = readJson(path.join(repositoryRoot, 'package.json'));
const temporaryPrefix = 'rbac-modern-consumer-';
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), temporaryPrefix));
const packageDirectory = path.join(temporaryRoot, 'package');
const consumerDirectory = path.join(temporaryRoot, 'consumer');
const exactDependencies = {
  '@nestarc/api-keys': '0.3.2',
  '@nestjs/common': '11.2.1',
  '@nestjs/core': '11.2.1',
  '@nestjs/platform-express': '11.2.1',
  '@nestjs/testing': '11.2.1',
  '@prisma/adapter-pg': '7.10.0',
  '@prisma/client': '7.10.0',
  pg: '8.16.3',
  prisma: '7.10.0',
  'reflect-metadata': '0.2.2',
  rxjs: '7.8.2',
  typescript: '5.9.3',
};

assertSafeNpmConfig();

try {
  if (temporaryRoot.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error('Modern consumer fixture must run outside the repository tree');
  }

  fs.mkdirSync(packageDirectory);
  fs.mkdirSync(consumerDirectory);
  writeJson(path.join(consumerDirectory, 'package.json'), {
    name: 'rbac-modern-consumer',
    private: true,
  });

  const packResult = spawnNpm(
    ['pack', '--json', '--ignore-scripts', '--pack-destination', packageDirectory],
    { cwd: repositoryRoot, encoding: 'utf8', env: process.env },
  );
  if (packResult.stderr) process.stderr.write(packResult.stderr);
  assertCommandSucceeded(packResult, 'npm pack');

  const [pack] = JSON.parse(packResult.stdout);
  if (
    pack?.name !== '@nestarc/rbac' ||
    pack.version !== packageJson.version ||
    !pack.filename ||
    !pack.integrity
  ) {
    throw new Error('npm pack --json did not return the expected RBAC package identity');
  }

  const tarballPath = path.join(packageDirectory, pack.filename);
  const tarballIntegrity = `sha512-${createHash('sha512')
    .update(fs.readFileSync(tarballPath))
    .digest('base64')}`;
  if (tarballIntegrity !== pack.integrity) {
    throw new Error(`Packed tarball integrity mismatch: ${tarballIntegrity} !== ${pack.integrity}`);
  }

  runNpm(
    [
      'install',
      '--strict-peer-deps',
      '--legacy-peer-deps=false',
      '--force=false',
      '--save-exact',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      tarballPath,
      ...Object.entries(exactDependencies).map(([name, version]) => `${name}@${version}`),
    ],
    consumerDirectory,
  );

  assertConsumerProvenance(pack, tarballPath);
  runNpm(['ls', '--depth=0'], consumerDirectory);

  const installedRbac = installedPackage('@nestarc/rbac');
  if (installedRbac.version !== packageJson.version) {
    throw new Error(`Expected RBAC ${packageJson.version}, received ${installedRbac.version}`);
  }
  for (const [name, expectedVersion] of Object.entries(exactDependencies)) {
    const installed = installedPackage(name);
    if (installed.version !== expectedVersion) {
      throw new Error(`Expected ${name} ${expectedVersion}, received ${installed.version}`);
    }
  }

  fs.writeFileSync(
    path.join(consumerDirectory, 'smoke.cjs'),
    [
      "require('reflect-metadata');",
      "const rbac = require('@nestarc/rbac');",
      "const prisma = require('@nestarc/rbac/prisma');",
      "const nestCore = require('@nestjs/core');",
      "if (typeof rbac.RbacModule !== 'function') throw new Error('missing RbacModule');",
      "if (typeof prisma.PrismaRbacStorage !== 'function') throw new Error('missing PrismaRbacStorage');",
      "if (typeof nestCore.NestFactory !== 'object') throw new Error('missing NestFactory');",
      '',
    ].join('\n'),
  );
  runCommand(process.execPath, ['smoke.cjs'], consumerDirectory, 'CommonJS runtime smoke');

  fs.writeFileSync(
    path.join(consumerDirectory, 'runtime-validation-smoke.cjs'),
    [
      "const { RbacConfigError, RbacService } = require('@nestarc/rbac');",
      'const storage = {',
      "  listEffectiveRoles: () => { throw new Error('invalid input reached storage'); },",
      "  listEffectivePermissions: () => { throw new Error('invalid input reached storage'); },",
      '};',
      'const service = new RbacService({ storage });',
      "const subject = { type: 'user', id: 'user_1', tenantId: 'tenant_1' };",
      'const inputs = [',
      "  { subject, tenantId: 'tenant_1', permission: 'reports.read', mode: 'sometimes' },",
      "  { subject, tenantId: 'tenant_1', permission: 'reports.read', tenantMode: 'sometimes' },",
      "  { subject, tenantId: 'tenant_1', permission: 'reports.read', now: new Date('invalid') },",
      "  { subject: null, tenantId: 'tenant_1', permission: 'reports.read' },",
      "  { subject, tenantId: 'tenant_1', permission: 'reports.read', resource: { type: '', id: '1' } },",
      '];',
      '(async () => {',
      '  for (const input of inputs) {',
      '    try {',
      '      await service.can(input);',
      "      throw new Error('invalid CommonJS runtime input was accepted');",
      '    } catch (error) {',
      '      if (!(error instanceof RbacConfigError)) throw error;',
      '    }',
      '  }',
      '})().catch((error) => {',
      '  console.error(error);',
      '  process.exitCode = 1;',
      '});',
      '',
    ].join('\n'),
  );
  runCommand(
    process.execPath,
    ['runtime-validation-smoke.cjs'],
    consumerDirectory,
    'CommonJS runtime validation smoke',
  );

  fs.writeFileSync(
    path.join(consumerDirectory, 'api-keys-smoke.cjs'),
    [
      "require('reflect-metadata');",
      "const { ApiKeysGuard, API_KEY_CONTEXT_PROPERTY } = require('@nestarc/api-keys');",
      "const { createApiKeySubjectResolver } = require('@nestarc/rbac/integrations/api-keys');",
      "const { Reflector } = require('@nestjs/core');",
      '(async () => {',
      "  const canonical = { keyId: 'canonical_key', tenantId: 'tenant_canonical', environment: 'live', scopes: [], prefix: 'nsk_live_fixture' };",
      "  const request = { headers: { authorization: 'Bearer verified_key' }, apiKeyContext: { keyId: 'legacy_key', tenantId: 'tenant_legacy' } };",
      '  const handler = () => undefined;',
      '  class Controller {}',
      '  const context = {',
      '    switchToHttp: () => ({ getRequest: () => request }),',
      '    getHandler: () => handler,',
      '    getClass: () => Controller,',
      '  };',
      '  const service = {',
      '    verify: async (rawKey) => {',
      "      if (rawKey !== 'verified_key') throw new Error('ApiKeysGuard received an unexpected key');",
      '      return canonical;',
      '    },',
      '  };',
      '  const guard = new ApiKeysGuard(service, new Reflector());',
      "  if (!(await guard.canActivate(context))) throw new Error('ApiKeysGuard did not allow the verified key');",
      "  if (API_KEY_CONTEXT_PROPERTY !== 'apiKey' || request.apiKey !== canonical) {",
      "    throw new Error('ApiKeysGuard did not write the canonical request.apiKey context');",
      '  }',
      '  const resolver = createApiKeySubjectResolver();',
      '  if (resolver(context) !== undefined) {',
      "    throw new Error('RBAC accepted conflicting canonical and legacy API key identities');",
      '  }',
      "  request.apiKeyContext = { keyId: 'canonical_key', tenantId: 'tenant_canonical' };",
      '  const subject = resolver(context);',
      "  if (subject?.id !== 'canonical_key' || subject.tenantId !== 'tenant_canonical' || subject.attributes !== canonical) {",
      "    throw new Error('RBAC did not select the matching canonical API key context exactly');",
      '  }',
      '})().catch((error) => {',
      '  console.error(error);',
      '  process.exitCode = 1;',
      '});',
      '',
    ].join('\n'),
  );
  runCommand(
    process.execPath,
    ['api-keys-smoke.cjs'],
    consumerDirectory,
    'API Keys 0.3.2 Guard to RBAC source-conflict smoke',
  );

  fs.writeFileSync(
    path.join(consumerDirectory, 'smoke.mjs'),
    [
      "import 'reflect-metadata';",
      "import { RbacModule } from '@nestarc/rbac';",
      "import { PrismaRbacStorage } from '@nestarc/rbac/prisma';",
      "if (typeof RbacModule !== 'function') throw new Error('missing RbacModule');",
      "if (typeof PrismaRbacStorage !== 'function') throw new Error('missing PrismaRbacStorage');",
      '',
    ].join('\n'),
  );
  runCommand(process.execPath, ['smoke.mjs'], consumerDirectory, 'ESM runtime smoke');

  fs.writeFileSync(
    path.join(consumerDirectory, 'runtime-validation-smoke.mjs'),
    [
      "import { RbacConfigError, RbacService } from '@nestarc/rbac';",
      'const storage = {',
      "  listEffectiveRoles: () => { throw new Error('invalid input reached storage'); },",
      "  listEffectivePermissions: () => { throw new Error('invalid input reached storage'); },",
      '};',
      'const service = new RbacService({ storage });',
      "const subject = { type: 'user', id: 'user_1', tenantId: 'tenant_1' };",
      'const inputs = [',
      "  { subject, tenantId: 'tenant_1', permissions: ['reports.read'], mode: 'sometimes' },",
      "  { subject, tenantId: 'tenant_1', permission: 'reports.read', tenantMode: 'sometimes' },",
      "  { subject, tenantId: 'tenant_1', permission: 'reports.read', now: '2026-01-15' },",
      "  { subject: [], tenantId: 'tenant_1', permission: 'reports.read' },",
      "  { subject, tenantId: 'tenant_1', roleKey: 'owner', resource: { type: 'project', id: 42 } },",
      '];',
      'for (const input of inputs) {',
      '  try {',
      '    await service.can(input);',
      "    throw new Error('invalid ESM runtime input was accepted');",
      '  } catch (error) {',
      '    if (!(error instanceof RbacConfigError)) throw error;',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  runCommand(
    process.execPath,
    ['runtime-validation-smoke.mjs'],
    consumerDirectory,
    'ESM runtime validation smoke',
  );

  fs.writeFileSync(
    path.join(consumerDirectory, 'smoke.ts'),
    [
      "import { RbacModule, type FindRoleByIdInput, type RbacLegacyDecisionReason, type RbacRole, type RbacService, type RbacServiceDecision, type RbacServiceDecisionReason, type RbacStorageRoleLookupCapability } from '@nestarc/rbac';",
      "import { PrismaRbacStorage, type PrismaRbacClientLike } from '@nestarc/rbac/prisma';",
      "import { expectDenied } from '@nestarc/rbac/testing';",
      'declare const prisma: PrismaRbacClientLike;',
      'RbacModule.forRoot({ storage: new PrismaRbacStorage(prisma) });',
      "type ServiceDecisionFromCan = Awaited<ReturnType<RbacService['can']>>;",
      'const serviceDecision = {} as ServiceDecisionFromCan satisfies RbacServiceDecision;',
      'const serviceReason: RbacServiceDecisionReason = serviceDecision.reason;',
      'const helperDecision = {} as Awaited<ReturnType<typeof expectDenied>> satisfies RbacServiceDecision;',
      'const roleLookup: RbacStorageRoleLookupCapability = {',
      '  findRoleById: async (input: FindRoleByIdInput): Promise<RbacRole | null> => {',
      '    void input.roleId;',
      '    return null;',
      '  },',
      '};',
      "const legacyReason: RbacLegacyDecisionReason = 'denied_role_expired';",
      '// @ts-expect-error Legacy reasons are not service-produced reasons.',
      'const unavailableServiceReason: RbacServiceDecisionReason = legacyReason;',
      'void serviceReason;',
      'void helperDecision.details.safeMessage;',
      'void roleLookup;',
      'void unavailableServiceReason;',
      '',
    ].join('\n'),
  );
  writeJson(path.join(consumerDirectory, 'tsconfig.json'), {
    compilerOptions: {
      exactOptionalPropertyTypes: true,
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      noUncheckedIndexedAccess: true,
      strict: true,
      target: 'ES2022',
    },
    include: ['smoke.ts'],
  });
  runCommand(
    process.execPath,
    [path.join('node_modules', 'typescript', 'bin', 'tsc')],
    consumerDirectory,
    'TypeScript declaration smoke',
  );

  const installedExamplesDirectory = path.join(
    consumerDirectory,
    'node_modules',
    '@nestarc',
    'rbac',
    'examples',
  );
  const consumerExamplesDirectory = path.join(consumerDirectory, 'examples');
  fs.cpSync(installedExamplesDirectory, consumerExamplesDirectory, { recursive: true });
  const shippedExampleSources = listFiles(consumerExamplesDirectory).filter((filePath) =>
    filePath.endsWith('.ts'),
  );
  if (shippedExampleSources.length === 0) {
    throw new Error('Packed RBAC package did not contain any TypeScript example sources');
  }
  writeJson(path.join(consumerDirectory, 'tsconfig.examples.json'), {
    compilerOptions: {
      experimentalDecorators: true,
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: 'ES2022',
    },
    include: ['examples/**/*.ts'],
  });
  runCommand(
    process.execPath,
    [path.join('node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.examples.json'],
    consumerDirectory,
    'Shipped examples TypeScript smoke',
  );

  console.log(
    JSON.stringify({
      package: pack.name,
      version: pack.version,
      integrity: pack.integrity,
      nest: exactDependencies['@nestjs/core'],
      prisma: exactDependencies['@prisma/client'],
      apiKeys: exactDependencies['@nestarc/api-keys'],
      exampleSources: shippedExampleSources
        .map((filePath) => path.relative(consumerExamplesDirectory, filePath))
        .sort(),
      node: process.version,
      result: 'passed',
    }),
  );
} finally {
  const expectedPrefix = path.join(os.tmpdir(), temporaryPrefix);
  if (temporaryRoot.startsWith(expectedPrefix)) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function installedPackage(packageName) {
  return readJson(path.join(consumerDirectory, 'node_modules', packageName, 'package.json'));
}

function assertConsumerProvenance(pack, tarballPath) {
  const consumerManifest = readJson(path.join(consumerDirectory, 'package.json'));
  const consumerLock = readJson(path.join(consumerDirectory, 'package-lock.json'));
  const lockRoot = consumerLock.packages?.[''];
  const rbacSpec = consumerManifest.dependencies?.['@nestarc/rbac'];

  const lockedTarballPath = rbacSpec?.startsWith('file:')
    ? path.resolve(consumerDirectory, rbacSpec.slice('file:'.length))
    : undefined;
  if (
    !lockedTarballPath ||
    fs.realpathSync(lockedTarballPath) !== fs.realpathSync(tarballPath) ||
    lockRoot?.dependencies?.['@nestarc/rbac'] !== rbacSpec
  ) {
    throw new Error(`Consumer did not lock RBAC to the packed candidate: ${String(rbacSpec)}`);
  }

  const rbacLock = consumerLock.packages?.['node_modules/@nestarc/rbac'];
  if (
    rbacLock?.version !== pack.version ||
    rbacLock.integrity !== pack.integrity ||
    rbacLock.resolved !== rbacSpec
  ) {
    throw new Error('Consumer lockfile RBAC provenance or integrity does not match npm pack');
  }

  for (const [name, expectedVersion] of Object.entries(exactDependencies)) {
    if (
      consumerManifest.dependencies?.[name] !== expectedVersion ||
      lockRoot?.dependencies?.[name] !== expectedVersion
    ) {
      throw new Error(`Consumer manifest did not save exact ${name}@${expectedVersion}`);
    }

    const lockEntry = consumerLock.packages?.[`node_modules/${name}`];
    if (
      lockEntry?.version !== expectedVersion ||
      !lockEntry.resolved?.startsWith('https://registry.npmjs.org/') ||
      !lockEntry.integrity?.startsWith('sha512-')
    ) {
      throw new Error(`Consumer lockfile lacks registry provenance for ${name}@${expectedVersion}`);
    }
  }
}

function assertSafeNpmConfig() {
  const unsafeVariables = [
    'npm_config_force',
    'NPM_CONFIG_FORCE',
    'npm_config_legacy_peer_deps',
    'NPM_CONFIG_LEGACY_PEER_DEPS',
  ];

  for (const variable of unsafeVariables) {
    const value = process.env[variable];
    if (value !== undefined && !['', '0', 'false', 'no'].includes(value.toLowerCase())) {
      throw new Error(`${variable}=${value} would weaken the strict consumer gate`);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function runNpm(args, cwd) {
  const result = spawnNpm(args, { cwd, env: process.env, stdio: 'inherit' });
  assertCommandSucceeded(result, `npm ${args.join(' ')}`);
}

function spawnNpm(args, options) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) return spawnSync(process.execPath, [npmExecPath, ...args], options);
  return spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, options);
}

function runCommand(command, args, cwd, label) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' });
  assertCommandSucceeded(result, label);
}

function assertCommandSucceeded(result, command) {
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}
