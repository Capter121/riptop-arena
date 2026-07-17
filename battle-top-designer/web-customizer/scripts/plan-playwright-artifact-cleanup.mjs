import { resolve } from 'node:path';
import { planArtifactCleanup } from './playwright-artifacts.mjs';

if (process.argv.includes('--apply')) {
  throw new Error('Bulk deletion is disabled. Review the dry-run plan and remove only explicitly approved files individually.');
}
process.stdout.write(`${JSON.stringify(planArtifactCleanup({ artifactRoot: resolve('test-artifacts') }), null, 2)}\n`);
