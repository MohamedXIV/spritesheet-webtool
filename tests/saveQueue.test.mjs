import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveQueue } from '../src/lib/saveQueue.ts';

test('saves run in the order requested, even when the first is slow', async () => {
  const enqueue = createSaveQueue();
  const events = [];
  let release;
  const first = enqueue(async () => {
    events.push('first-start');
    await new Promise(resolve => { release = resolve; });
    events.push('first-finish');
    return 'first';
  });
  const second = enqueue(async () => {
    events.push('second-start');
    return 'second';
  });

  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['first-start']);
  release();
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(events, ['first-start', 'first-finish', 'second-start']);
});

test('a failed save does not block later saves', async () => {
  const enqueue = createSaveQueue();
  await assert.rejects(enqueue(async () => { throw new Error('QuotaExceeded'); }), /QuotaExceeded/);
  assert.equal(await enqueue(async () => 'recovered'), 'recovered');
});
