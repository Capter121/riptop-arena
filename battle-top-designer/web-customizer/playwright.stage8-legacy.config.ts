import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from './playwright.config';
import { artifactReporterName } from './scripts/playwright-artifacts.mjs';

const runDir = process.env.NSS_PLAYWRIGHT_ARTIFACT_RUN_DIR;
if (!runDir) throw new Error('NSS_PLAYWRIGHT_ARTIFACT_RUN_DIR is required for Stage 8 legacy runs.');
const evidenceType = process.env.NSS_PLAYWRIGHT_EVIDENCE_TYPE;
const collectionOnly = evidenceType === 'COLLECTION_ONLY';
const listRequested = process.argv.includes('--list');
if (listRequested && !collectionOnly) throw new Error('Playwright --list requires COLLECTION_ONLY evidence.');
if (!listRequested && collectionOnly) throw new Error('COLLECTION_ONLY may only be used with --list.');

export default defineConfig({
  ...base,
  outputDir: resolve(runDir, 'test-results'),
  reporter: [
    ['line'],
    ['json', { outputFile: resolve(runDir, artifactReporterName(evidenceType)) }],
    ['html', { outputFolder: resolve(runDir, 'playwright-report'), open: 'never' }],
  ],
});
