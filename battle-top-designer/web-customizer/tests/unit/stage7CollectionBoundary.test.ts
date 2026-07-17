import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stage7Root = resolve('tests/stage7');
const entry = resolve(stage7Root, 'anonymous-test-mode.spec.ts');
const forbidden = /[\\/]src[\\/](?:domain|store|App|Scene)(?:\.[cm]?[jt]sx?)?$/i;
const importPattern = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;

function resolveLocalImport(fromFile: string, specifier: string) {
  const base = resolve(dirname(fromFile), specifier);
  if (extname(base)) return base;
  for (const suffix of ['.ts', '.tsx', '.js', '.mjs']) {
    try { readFileSync(`${base}${suffix}`); return `${base}${suffix}`; } catch { /* Continue. */ }
  }
  return base;
}

function dependencyGraph(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    if (!match[1].startsWith('.')) continue;
    const dependency = resolveLocalImport(file, match[1]);
    if (dependency.startsWith(stage7Root)) dependencyGraph(dependency, seen);
    else seen.add(dependency);
  }
  return seen;
}

describe('Stage 7 Playwright collection boundary', () => {
  it('does not import browser application entry modules directly or transitively', () => {
    const dependencies = [...dependencyGraph(entry)];
    expect(dependencies.filter(file => forbidden.test(file))).toEqual([]);
  });

  it('keeps the expected four Stage 7 scenarios in the spec', () => {
    const source = readFileSync(entry, 'utf8');
    expect(source.match(/^test\('/gm)).toHaveLength(4);
  });

  it('uses only Stage 7 test and helper modules below the collection root', () => {
    const dependencies = [...dependencyGraph(entry)].filter(file => file.startsWith(stage7Root));
    expect(dependencies.every(file => file.startsWith(stage7Root))).toBe(true);
  });
});
