#!/usr/bin/env node

/**
 * Push the crucible/ subtree to the standalone public mirror repo.
 *
 * Usage:
 *   node scripts/sync-crucible-public.cjs
 *   node scripts/sync-crucible-public.cjs --dry-run
 *   node scripts/sync-crucible-public.cjs --target-branch smoke-test
 */

const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const defaultRemoteUrl = 'git@github.com:DMontgomery40/ragweld-crucible.git';

function parseArgs(argv) {
  const out = {
    dryRun: false,
    prefix: process.env.CRUCIBLE_PUBLIC_PREFIX || 'crucible',
    targetBranch: process.env.CRUCIBLE_PUBLIC_BRANCH || 'main',
    targetRemoteUrl: process.env.CRUCIBLE_PUBLIC_REMOTE || defaultRemoteUrl,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (arg === '--prefix') {
      out.prefix = argv[++i] || out.prefix;
      continue;
    }
    if (arg === '--target-branch') {
      out.targetBranch = argv[++i] || out.targetBranch;
      continue;
    }
    if (arg === '--target-remote-url') {
      out.targetRemoteUrl = argv[++i] || out.targetRemoteUrl;
    }
  }

  return out;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function runInherit(command, args) {
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  });
}

function readHeadSha() {
  return run('git', ['rev-parse', 'HEAD']).trim();
}

function computeSplitSha(prefix) {
  return run('git', ['subtree', 'split', `--prefix=${prefix}`, 'HEAD']).trim();
}

function readRemoteBranchSha(remoteUrl, branch) {
  const output = run('git', ['ls-remote', remoteUrl, `refs/heads/${branch}`]).trim();
  if (!output) {
    return null;
  }
  return output.split(/\s+/)[0] || null;
}

function main() {
  const args = parseArgs(process.argv);
  const sourceHead = readHeadSha();
  const splitSha = computeSplitSha(args.prefix);
  const remoteBranchSha = readRemoteBranchSha(args.targetRemoteUrl, args.targetBranch);

  console.log(`Source HEAD: ${sourceHead}`);
  console.log(`Split ${args.prefix}/ subtree: ${splitSha}`);
  console.log(`Target remote: ${args.targetRemoteUrl}`);
  console.log(`Target branch: ${args.targetBranch}`);

  if (remoteBranchSha) {
    console.log(`Current target SHA: ${remoteBranchSha}`);
  } else {
    console.log('Current target SHA: <missing branch>');
  }

  if (remoteBranchSha === splitSha) {
    console.log('Public mirror already matches this subtree split. Nothing to push.');
    return;
  }

  const remoteName = `crucible-public-${Date.now()}`;
  try {
    runInherit('git', ['remote', 'add', remoteName, args.targetRemoteUrl]);
    const pushArgs = ['push', '--force', remoteName, `${splitSha}:refs/heads/${args.targetBranch}`];
    if (args.dryRun) {
      pushArgs.splice(1, 0, '--dry-run');
    }
    runInherit('git', pushArgs);
  } finally {
    try {
      runInherit('git', ['remote', 'remove', remoteName]);
    } catch (error) {
      console.warn(`Warning: failed to remove temporary remote ${remoteName}: ${error.message}`);
    }
  }
}

main();
