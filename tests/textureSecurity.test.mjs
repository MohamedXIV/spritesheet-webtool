import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/app/api/generate-texture/route.ts', import.meta.url), 'utf8');

test('public AI texture route cannot execute child processes or read arbitrary output files', () => {
  assert.doesNotMatch(route, /\b(child_process|spawn\s*\(|exec\s*\(|execFile\s*\(|fs\.readFileSync|fs\.writeFileSync)\b/);
});

test('public AI texture route rejects custom URLs and CLI requests before contacting providers', () => {
  assert.match(route, /provider === 'custom' \|\| provider === 'local-cli'/);
  assert.match(route, /status: 403/);
  assert.doesNotMatch(route, /fetch\(customEndpoint|fetch\(imageUrl|fetch\(cliCommand/);
});
