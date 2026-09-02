'use strict';

const fs = require('node:fs');
const { loadPackageCandidate } = require('./package-candidate.cjs');

const candidate = loadPackageCandidate(process.argv.slice(2));
const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  fs.appendFileSync(githubOutput, `tarball=${candidate.tarballPath}\n`);
  fs.appendFileSync(githubOutput, `manifest=${candidate.manifestPath}\n`);
}

console.log(
  JSON.stringify({
    package: candidate.manifest.name,
    version: candidate.manifest.version,
    integrity: candidate.manifest.integrity,
    tarball: candidate.tarballPath,
    result: 'passed',
  }),
);
