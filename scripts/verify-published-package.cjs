'use strict';

const { spawnSync } = require('node:child_process');
const { loadPackageCandidate } = require('./package-candidate.cjs');

function main() {
  const candidate = loadPackageCandidate(process.argv.slice(2));
  const packageSpec = `${candidate.manifest.name}@${candidate.manifest.version}`;
  const maxAttempts = 12;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const dist = npmView(packageSpec);
      verifyPublishedDist(dist, candidate.manifest);
      console.log(
        JSON.stringify({
          package: packageSpec,
          integrity: dist.integrity,
          provenance: dist.attestations.provenance.predicateType,
          result: 'passed',
        }),
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
      }
    }
  }

  throw new Error(
    `Published package verification failed after ${maxAttempts} attempts: ${lastError}`,
  );
}

function npmView(spec) {
  const args = ['view', spec, 'dist', '--json'];
  const npmExecPath = process.env.npm_execpath;
  const result = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, ...args], { encoding: 'utf8', env: process.env })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
        encoding: 'utf8',
        env: process.env,
      });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `npm view exited ${result.status}`);
  return JSON.parse(result.stdout);
}

function verifyPublishedDist(dist, manifest) {
  if (dist?.integrity !== manifest.integrity || dist?.shasum !== manifest.shasum) {
    throw new Error('Published registry integrity does not match the verified tarball');
  }
  if (dist.fileCount !== manifest.entryCount || dist.unpackedSize !== manifest.unpackedSize) {
    throw new Error('Published registry file metadata does not match the verified tarball');
  }
  if (
    !dist.attestations?.url ||
    dist.attestations?.provenance?.predicateType !== 'https://slsa.dev/provenance/v1'
  ) {
    throw new Error('Published package is missing its SLSA provenance attestation');
  }
}

if (require.main === module) main();

module.exports = { verifyPublishedDist };
