'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_FILENAME = 'package-contract.json';

function parseOption(args, name) {
  const optionIndex = args.indexOf(name);
  if (optionIndex === -1) return undefined;

  const value = args[optionIndex + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function hashFile(filePath, algorithm, encoding) {
  return createHash(algorithm).update(fs.readFileSync(filePath)).digest(encoding);
}

function loadPackageCandidate(args, cwd = process.cwd()) {
  const packageDirectoryOption = parseOption(args, '--package-dir');
  const manifestOption = parseOption(args, '--manifest');
  if (packageDirectoryOption && manifestOption) {
    throw new Error('Use either --package-dir or --manifest, not both');
  }

  const manifestPath = path.resolve(
    cwd,
    manifestOption ?? path.join(packageDirectoryOption ?? 'artifacts/package', MANIFEST_FILENAME),
  );
  const packageDirectory = path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    manifest?.schemaVersion !== 1 ||
    typeof manifest.name !== 'string' ||
    typeof manifest.version !== 'string' ||
    typeof manifest.filename !== 'string' ||
    typeof manifest.integrity !== 'string' ||
    typeof manifest.shasum !== 'string' ||
    typeof manifest.size !== 'number' ||
    typeof manifest.unpackedSize !== 'number' ||
    typeof manifest.entryCount !== 'number' ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== manifest.entryCount
  ) {
    throw new Error(`Invalid package contract manifest: ${manifestPath}`);
  }

  if (
    path.basename(manifest.filename) !== manifest.filename ||
    !manifest.filename.endsWith('.tgz')
  ) {
    throw new Error(`Unsafe package tarball filename: ${manifest.filename}`);
  }

  const tarballPath = path.join(packageDirectory, manifest.filename);
  const stats = fs.statSync(tarballPath);
  const integrity = `sha512-${hashFile(tarballPath, 'sha512', 'base64')}`;
  const shasum = hashFile(tarballPath, 'sha1', 'hex');
  if (
    stats.size !== manifest.size ||
    integrity !== manifest.integrity ||
    shasum !== manifest.shasum
  ) {
    throw new Error('Package tarball bytes do not match the package contract manifest');
  }

  return { manifest, manifestPath, packageDirectory, tarballPath };
}

module.exports = { MANIFEST_FILENAME, loadPackageCandidate, parseOption };
