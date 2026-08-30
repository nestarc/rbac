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
    path.join(consumerDirectory, 'smoke.ts'),
    [
      "import { RbacModule } from '@nestarc/rbac';",
      "import { PrismaRbacStorage, type PrismaRbacClientLike } from '@nestarc/rbac/prisma';",
      'declare const prisma: PrismaRbacClientLike;',
      'RbacModule.forRoot({ storage: new PrismaRbacStorage(prisma) });',
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

  console.log(
    JSON.stringify({
      package: pack.name,
      version: pack.version,
      integrity: pack.integrity,
      nest: exactDependencies['@nestjs/core'],
      prisma: exactDependencies['@prisma/client'],
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
