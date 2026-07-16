import { gzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const budgets = { shellGzipBytes: 120_000, totalGzipBytes: 360_000 };

export function evaluateBudgets(metrics) {
  const errors = [];
  if (!Number.isFinite(metrics.shellGzipBytes)) errors.push('MISSING_SHELL_GZIP');
  else if (metrics.shellGzipBytes > budgets.shellGzipBytes) errors.push('SHELL_GZIP_BUDGET');
  if (!Number.isFinite(metrics.totalGzipBytes)) errors.push('MISSING_TOTAL_GZIP');
  else if (metrics.totalGzipBytes > budgets.totalGzipBytes) errors.push('TOTAL_GZIP_BUDGET');
  return { status: errors.length ? 'FAIL' : 'PASS', errors };
}

export async function analyzeBundle(directory = resolve(import.meta.dirname, '../dist')) {
  const html = await readFile(resolve(directory, 'index.html'), 'utf8');
  const entryMatch = html.match(/<script[^>]+src="([^"]+\.js)"/);
  if (!entryMatch) throw new Error('Vite entry script was not found.');
  const entryFile = basename(entryMatch[1]);
  const assetDirectory = resolve(directory, 'assets');
  const files = (await readdir(assetDirectory)).filter(file => file.endsWith('.js')).sort();
  const chunks = await Promise.all(files.map(async file => {
    const bytes = await readFile(resolve(assetDirectory, file));
    return { file: `assets/${file}`, role: file === entryFile ? 'shell' : 'async', rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  }));
  const shell = chunks.find(chunk => chunk.role === 'shell');
  const metrics = {
    shellGzipBytes: shell?.gzipBytes ?? Number.NaN,
    totalGzipBytes: chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0),
  };
  return { schemaVersion: 1, budgets, metrics, chunks, ...evaluateBudgets(metrics) };
}

async function main() {
  const report = await analyzeBundle();
  const output = resolve(import.meta.dirname, '../../reports/validation/phase3b-bundle.json');
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, `${JSON.stringify({
    ...report,
    notices: [
      'Human visual review remains pending.',
      'Development continued under a documented provisional internal-prototype decision.',
    ],
  }, null, 2)}\n`);
  console.log(`PHASE3B_BUNDLE=${report.status}\nSHELL_GZIP_BYTES=${report.metrics.shellGzipBytes}\nTOTAL_GZIP_BYTES=${report.metrics.totalGzipBytes}`);
  if (report.status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
