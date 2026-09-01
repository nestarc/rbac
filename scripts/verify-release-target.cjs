const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function assertSafeRef(value, label) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/+-]*$/.test(value) ||
    value.includes('..') ||
    value.includes('@{') ||
    value.includes('//') ||
    value.endsWith('/')
  ) {
    throw new Error(`${label} is not a safe Git ref or commit: ${value}`);
  }
}

function resolveCommit(candidates, git) {
  for (const candidate of candidates) {
    try {
      return git(['rev-parse', '--verify', '--end-of-options', `${candidate}^{commit}`]);
    } catch {
      // Try the next unambiguous candidate.
    }
  }
  throw new Error(`Could not resolve release target: ${candidates.join(', ')}`);
}

function assertAncestor(ancestor, descendant, label, git) {
  try {
    git(['merge-base', '--is-ancestor', ancestor, descendant]);
  } catch {
    throw new Error(`${label}: ${ancestor} is not an ancestor of ${descendant}`);
  }
}

function verifyReleaseTarget({ tagName, targetCommitish, packageVersion, git = runGit }) {
  if (!tagName || !targetCommitish || !packageVersion) {
    throw new Error('Release tag, target commitish, and package version are required.');
  }

  assertSafeRef(tagName, 'Release tag');
  assertSafeRef(targetCommitish, 'Release target');

  const expectedTag = `v${packageVersion}`;
  if (tagName !== expectedTag) {
    throw new Error(`Release tag ${tagName} does not match package.json version ${packageVersion}.`);
  }

  const tagCommit = resolveCommit([`refs/tags/${tagName}`], git);
  const checkoutCommit = resolveCommit(['HEAD'], git);
  const mainCommit = resolveCommit(['refs/remotes/origin/main'], git);
  const targetCandidates = targetCommitish.startsWith('refs/heads/')
    ? [`refs/remotes/origin/${targetCommitish.slice('refs/heads/'.length)}`, targetCommitish]
    : targetCommitish.startsWith('refs/')
      ? [targetCommitish]
      : [`refs/remotes/origin/${targetCommitish}`, targetCommitish];
  const targetCommit = resolveCommit(targetCandidates, git);

  if (checkoutCommit !== tagCommit) {
    throw new Error(`Checked out commit ${checkoutCommit} does not match tag commit ${tagCommit}.`);
  }

  assertAncestor(tagCommit, targetCommit, 'Release tag/target ancestry check failed', git);
  assertAncestor(targetCommit, mainCommit, 'Release target/main ancestry check failed', git);

  return { tagName, tagCommit, targetCommit, mainCommit };
}

if (require.main === module) {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));
    const result = verifyReleaseTarget({
      tagName: process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME,
      targetCommitish: process.env.RELEASE_TARGET_COMMITISH,
      packageVersion: packageJson.version,
    });
    process.stdout.write(
      `Verified release ${result.tagName}: tag ${result.tagCommit}, target ${result.targetCommit}, main ${result.mainCommit}.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { verifyReleaseTarget };
