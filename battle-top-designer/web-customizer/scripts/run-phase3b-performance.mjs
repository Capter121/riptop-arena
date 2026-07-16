import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluatePerformance } from './evaluate-performance.mjs';

const report = process.argv[2] ?? 'phase3b-performance-current.json';
if (!/^[a-z0-9.-]+\.json$/i.test(report)) throw new Error('Invalid performance report name.');
execFileSync(process.execPath, [resolve('node_modules/playwright/cli.js'), 'test', '--config', 'playwright.performance.config.ts'], {
  cwd: resolve(import.meta.dirname, '..'),
  env: { ...process.env, PHASE3B_PERF_REPORT: report },
  stdio: 'inherit',
});
const reportPath = resolve(import.meta.dirname, '../../reports/validation', report);
const result = evaluatePerformance(JSON.parse(readFileSync(reportPath, 'utf8')));
console.log(JSON.stringify(result, null, 2));
if (result.status === 'FAIL') process.exitCode = 1;
