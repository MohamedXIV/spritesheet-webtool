import test from 'node:test';
import assert from 'node:assert/strict';
import { getProject, saveProject } from '../src/lib/projectDatabase.ts';

// A deliberately controlled IndexedDB stand-in: request callbacks happen
// before transaction completion, just as they do in a real browser.
function mockIndexedDb(seed = []) {
  const records = new Map(seed.map(project => [project.id, project]));
  let activeTransaction = null;
  let closeCount = 0;

  const store = {
    get(id) {
      const request = { result: undefined, onsuccess: null };
      queueMicrotask(() => {
        request.result = records.get(id);
        request.onsuccess?.();
      });
      return request;
    },
    put(project) {
      const request = { onsuccess: null };
      queueMicrotask(() => {
        records.set(project.id, project);
        request.onsuccess?.();
      });
      return request;
    },
  };

  const database = {
    objectStoreNames: { contains: () => true },
    close() { closeCount++; },
    transaction() {
      activeTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => store,
      };
      return activeTransaction;
    },
  };

  globalThis.window = {};
  globalThis.indexedDB = {
    open() {
      const request = { result: undefined, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    },
  };

  return {
    records,
    get closeCount() { return closeCount; },
    commit() { assert.ok(activeTransaction); activeTransaction.oncomplete?.(); },
    abort() {
      assert.ok(activeTransaction);
      activeTransaction.error = new Error('disk full');
      activeTransaction.onabort?.();
    },
  };
}

function sampleProject(overrides = {}) {
  return {
    id: 'spritesheet-1',
    name: 'Walking',
    type: 'spritesheet',
    createdAt: 100,
    updatedAt: 100,
    metadata: { folders: [], selectedIds: [], fps: 12, loopMode: 'normal' },
    frames: [],
    ...overrides,
  };
}

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('save waits for transaction completion, not just request success', async () => {
  const database = mockIndexedDb();
  let resolved = false;
  const saving = saveProject(sampleProject()).then(() => { resolved = true; });
  await nextTurn();
  assert.ok(database.records.has('spritesheet-1'), 'put request should already have run');
  assert.equal(resolved, false, 'transaction has not committed yet');
  database.commit();
  await saving;
  assert.equal(resolved, true);
  assert.equal(database.closeCount, 1);
});

test('subsequent saves preserve the original createdAt timestamp', async () => {
  const database = mockIndexedDb([sampleProject({ createdAt: 42, updatedAt: 43 })]);
  const saving = saveProject(sampleProject({ name: 'Updated', createdAt: 999 }));
  await nextTurn();
  database.commit();
  await saving;
  assert.equal(database.records.get('spritesheet-1').createdAt, 42);
  assert.equal(database.records.get('spritesheet-1').name, 'Updated');
});

test('failed transaction rejects instead of reporting success', async () => {
  const database = mockIndexedDb();
  const saving = saveProject(sampleProject());
  await nextTurn();
  database.abort();
  await assert.rejects(saving, /aborted: disk full/);
  assert.equal(database.closeCount, 1);
});

test('restoring a project waits for the read transaction to finish', async () => {
  const database = mockIndexedDb([sampleProject({ name: 'Persisted' })]);
  let settled = false;
  const loading = getProject('spritesheet-1').then(project => {
    settled = true;
    return project;
  });
  await nextTurn();
  assert.equal(settled, false);
  database.commit();
  const restored = await loading;
  assert.equal(restored.name, 'Persisted');
  assert.equal(database.closeCount, 1);
});
