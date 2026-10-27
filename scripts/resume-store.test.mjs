import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDemoVault } from './demo-vault.mjs';
import { ResumeFile } from './resume-store.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-file-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await createDemoVault(directory);
  return new ResumeFile(directory);
}
test('private résumé saves atomically, preserves a backup, and survives a new reader', async (t) => {
  const store = await fixture(t);
  const current = await store.read();
  const edited = structuredClone(current.document);
  edited.profile.name = 'Edited sample';
  const saved = await store.save(edited, current.revision);
  assert.equal(saved.document.profile.name, 'Edited sample');
  assert.notEqual(saved.revision, current.revision);
  assert.deepEqual(await new ResumeFile(path.resolve(store.directory, '../../..')).read(), saved);
  const backups = await fs.readdir(path.join(store.directory, 'history'));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(store.directory, 'history', backups[0]), 'utf8')), current.document);
});
test('concurrent tabs and external edits cannot overwrite newer résumé data', async (t) => {
  const store = await fixture(t);
  const base = await store.read();
  const first = structuredClone(base.document); first.profile.name = 'First tab';
  const second = structuredClone(base.document); second.profile.name = 'Second tab';
  const results = await Promise.allSettled([store.save(first, base.revision), store.save(second, base.revision)]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].reason.status, 409);
  assert.equal((await store.read()).document.profile.name, 'First tab');
  await fs.writeFile(store.file, JSON.stringify(second));
  await assert.rejects(store.save(first, results[0].value.revision), { status: 409 });
});
test('invalid résumé input leaves the private file unchanged', async (t) => {
  const store = await fixture(t);
  const current = await store.read();
  await assert.rejects(store.save({ schemaVersion: 2 }, current.revision), { status: 400 });
  assert.deepEqual(await store.read(), current);
});
