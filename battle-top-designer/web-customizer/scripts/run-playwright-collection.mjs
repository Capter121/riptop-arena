import { spawnSync } from 'node:child_process';

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

const runIdIndex = process.argv.indexOf('--run-id');
const explicit = runIdIndex === -1 ? null : process.argv[runIdIndex + 1];
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const runId = explicit || `collection-${timestamp}-${git('rev-parse', '--short=7', 'HEAD')}`;
const result = spawnSync(process.execPath, [
  'scripts/run-playwright-artifact.mjs',
  '--gate-name', 'PLAYWRIGHT_COLLECTION',
  '--run-id', runId,
  '--config', 'playwright.stage7.config.ts',
  '--evidence-type', 'COLLECTION_ONLY',
  '--', '--list',
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
