'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { MANIFEST_FILENAME, parseOption } = require('./package-candidate.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const packageJson = readJson(path.join(repositoryRoot, 'package.json'));
const policy = readJson(path.join(repositoryRoot, '.github/package-contract.json'));
const outputDirectory = path.resolve(
  repositoryRoot,
  parseOption(process.argv.slice(2), '--output') ?? 'artifacts/package',
);

assertSafeOutputDirectory(outputDirectory);
fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

const packResult = spawnNpm(
  ['pack', '--json', '--ignore-scripts', '--pack-destination', outputDirectory],
  { cwd: repositoryRoot, encoding: 'utf8', env: process.env },
);
if (packResult.stderr) process.stderr.write(packResult.stderr);
assertCommandSucceeded(packResult, 'npm pack');

const packEntries = JSON.parse(packResult.stdout);
if (!Array.isArray(packEntries) || packEntries.length !== 1) {
  throw new Error('npm pack --json must produce exactly one package');
}
const [pack] = packEntries;
if (
  pack?.name !== packageJson.name ||
  pack.version !== packageJson.version ||
  !pack.filename ||
  !pack.integrity ||
  !pack.shasum ||
  !Array.isArray(pack.files)
) {
  throw new Error('npm pack --json did not return the expected package contract fields');
}

const tarballPath = path.join(outputDirectory, pack.filename);
const tarballBytes = fs.readFileSync(tarballPath);
const integrity = `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`;
const shasum = createHash('sha1').update(tarballBytes).digest('hex');
if (integrity !== pack.integrity || shasum !== pack.shasum || tarballBytes.length !== pack.size) {
  throw new Error('npm pack metadata does not match the generated tarball bytes');
}

verifySizeBudget(pack, policy);
const packagedPaths = new Set(pack.files.map((file) => file.path));
verifyAllowlist(packagedPaths, policy);
verifyPackageFilesDeclaration(packageJson.files, policy.allowedPaths);
verifyExportTargets(packageJson.exports, packagedPaths);
verifyLocalMarkdownLinks(packagedPaths);

const manifest = {
  schemaVersion: 1,
  name: pack.name,
  version: pack.version,
  filename: pack.filename,
  integrity: pack.integrity,
  shasum: pack.shasum,
  size: pack.size,
  unpackedSize: pack.unpackedSize,
  entryCount: pack.entryCount,
  files: [...packagedPaths].sort(),
};
fs.writeFileSync(
  path.join(outputDirectory, MANIFEST_FILENAME),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(JSON.stringify(manifest));

function verifySizeBudget(packResult, contract) {
  if (packResult.size > contract.maxTarballBytes) {
    throw new Error(
      `Tarball size ${packResult.size} exceeds ${contract.maxTarballBytes} byte budget`,
    );
  }
  if (packResult.unpackedSize > contract.maxUnpackedBytes) {
    throw new Error(
      `Unpacked size ${packResult.unpackedSize} exceeds ${contract.maxUnpackedBytes} byte budget`,
    );
  }
}

function verifyAllowlist(packagedPaths, contract) {
  const unexpected = [...packagedPaths].filter(
    (filePath) => !contract.allowedPaths.some((pattern) => matchesPath(pattern, filePath)),
  );
  if (unexpected.length > 0) {
    throw new Error(`Tarball contains paths outside the allowlist: ${unexpected.join(', ')}`);
  }

  const missing = contract.requiredPaths.filter((filePath) => !packagedPaths.has(filePath));
  if (missing.length > 0) {
    throw new Error(`Tarball is missing required paths: ${missing.join(', ')}`);
  }
}

function verifyPackageFilesDeclaration(packageFiles, allowedPaths) {
  if (!Array.isArray(packageFiles)) throw new Error('package.json files must be an array');

  const normalizedAllowedRoots = allowedPaths
    .filter((filePath) => filePath !== 'package.json')
    .map((filePath) => filePath.replace(/\/\*\*$/, ''))
    .sort();
  const normalizedPackageFiles = [...packageFiles].sort();
  if (JSON.stringify(normalizedPackageFiles) !== JSON.stringify(normalizedAllowedRoots)) {
    throw new Error('package.json files must exactly match the package contract allowlist');
  }
}

function verifyExportTargets(exports, packagedPaths) {
  if (!exports || typeof exports !== 'object') throw new Error('package exports are required');

  const missing = [];
  for (const [subpath, conditions] of Object.entries(exports)) {
    for (const target of collectExportTargets(conditions)) {
      const packagedPath = target.replace(/^\.\//, '');
      if (!packagedPaths.has(packagedPath)) missing.push(`${subpath}: ${target}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Package export targets are missing from the tarball: ${missing.join(', ')}`);
  }
}

function collectExportTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(collectExportTargets);
}

function verifyLocalMarkdownLinks(packagedPaths) {
  const markdownPaths = [...packagedPaths].filter((filePath) => filePath.endsWith('.md'));
  const brokenLinks = [];
  for (const markdownPath of markdownPaths) {
    const contents = fs.readFileSync(path.join(repositoryRoot, markdownPath), 'utf8');
    for (const match of contents.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const destination = match[1].trim().replace(/^<|>$/g, '');
      if (/^(?:[a-z]+:|#)/i.test(destination)) continue;

      const decodedPath = decodeURIComponent(destination.split('#', 1)[0]);
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(markdownPath), decodedPath),
      );
      const exists =
        packagedPaths.has(target) ||
        [...packagedPaths].some((file) => file.startsWith(`${target}/`));
      if (!exists) brokenLinks.push(`${markdownPath} -> ${destination}`);
    }
  }
  if (brokenLinks.length > 0) {
    throw new Error(`Packed documentation contains broken local links: ${brokenLinks.join(', ')}`);
  }
}

function matchesPath(pattern, filePath) {
  return pattern.endsWith('/**') ? filePath.startsWith(pattern.slice(0, -2)) : filePath === pattern;
}

function assertSafeOutputDirectory(directory) {
  const relative = path.relative(repositoryRoot, directory);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error('Package output directory must be inside the repository');
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function spawnNpm(args, options) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) return spawnSync(process.execPath, [npmExecPath, ...args], options);
  return spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, options);
}

function assertCommandSucceeded(result, command) {
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}
