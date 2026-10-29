import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { root } from './config.mjs';
import { createDemoVault } from './demo-vault.mjs';

const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'songhai-preview-'));
await createDemoVault(vault);
const write = (file, text) => {
  const target = path.join(vault, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
};
for (const brand of ['frank', 'frankie', 'franklin']) write(`assets/2026-09-22/${brand}.svg`, '<svg/>');
write('Notes/Hidden.md', 'PRIVATE_PREVIEW_SENTINEL');
write('Daily/HiddenDay.md', 'PRIVATE_DAY_SENTINEL');
write('Blog/Preview.md', '# Preview\n\nInitial public text. [[Hidden]]\n');
const server = spawn(process.execPath, ['scripts/dev.mjs'], { cwd: root, env: { ...process.env, VAULT_ROOT: vault }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
server.stdout.on('data', (data) => { logs += data; });
server.stderr.on('data', (data) => { logs += data; });
const finished = once(server, 'exit');
async function until(check, label, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch {}
    if (server.exitCode !== null) throw new Error(`Preview exited before ${label}:\n${logs}`);
    await delay(200);
  }
  throw new Error(`Timeout: ${label}\n${logs}`);
}
const index = async () => (await fetch('http://127.0.0.1:5173/api/search-index.json')).json();
const has = async (text) => JSON.stringify(await index()).includes(text);
try {
  await until(async () => (await fetch('http://127.0.0.1:4174/')).ok && await has('Initial public text'), 'both servers');
  const home = await (await fetch('http://127.0.0.1:4174/')).text();
  assert.match(home, /name="songhai-blog-origin"/);
  assert.match(home, /href="http:\/\/127.0.0.1:5173\//);
  const response = await fetch('http://127.0.0.1:5173/api/search-index.json', { headers: { Origin: 'http://127.0.0.1:4174' } });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:4174');
  assert.doesNotMatch(JSON.stringify(await index()), /PRIVATE_PREVIEW_SENTINEL|PRIVATE_DAY_SENTINEL/);
  for (const file of ['Notes/Hidden.md', 'Daily/HiddenDay.md']) {
    const result = await fetch(`http://127.0.0.1:5173/@fs${path.join(vault, file)}`);
    assert.equal(result.status, 403);
    assert.doesNotMatch(await result.text(), /PRIVATE_PREVIEW_SENTINEL|PRIVATE_DAY_SENTINEL/);
  }
  write('Blog/Preview.md', '# Preview\n\nUpdated public text. [[Hidden]]\n');
  await until(() => has('Updated public text'), 'edit refresh');
  write('Blog/Added.md', '# Added\n\nNew public text.\n');
  await until(() => has('New public text'), 'add refresh');
  fs.unlinkSync(path.join(vault, 'Blog/Added.md'));
  await until(async () => !(await has('New public text')), 'delete refresh');
  write('Blog/Preview.md', '# Preview\n\n[[Missing reference]]\n');
  await until(() => logs.includes('Could not update public blog'), 'invalid reference error');
  assert.equal(await has('Updated public text'), true);
  write('Blog/Preview.md', '# Preview\n\nRecovered public text.\n');
  await until(() => has('Recovered public text'), 'recovery');
  fs.renameSync(path.join(vault, 'Blog'), path.join(vault, 'Public'));
  fs.renameSync(path.join(vault, 'assets'), path.join(vault, 'Media'));
  fs.renameSync(path.join(vault, 'Notes'), path.join(vault, 'Drafts'));
  write('.blog-publisher.json', JSON.stringify({ publicFolder: 'Public', assetsFolder: 'Media', privateFolders: ['Drafts', 'Daily'] }));
  write('Public/Preview.md', '# Preview\n\nCustom folder content. [[Hidden]]\n');
  await until(() => has('Custom folder content'), 'custom directory configuration refresh');
  write('Public/Preview.md', '# Preview\n\nCustom folder edit. [[Hidden]]\n');
  await until(() => has('Custom folder edit'), 'custom directory watcher');
  const privateFile = await fetch(`http://127.0.0.1:5173/@fs${path.join(vault, 'Drafts/Hidden.md')}`);
  assert.equal(privateFile.status, 403);
  assert.doesNotMatch(await privateFile.text(), /PRIVATE_PREVIEW_SENTINEL/);
  console.info('PASS: separate vault; startup; local links/CORS; private-file exclusion; add/edit/delete; failed-stage recovery; custom directory changes and watcher.');
} finally {
  server.kill('SIGTERM');
  await finished;
  fs.rmSync(vault, { recursive: true, force: true });
}
for (const port of [4174, 5173]) {
  let running = false;
  try { await fetch(`http://127.0.0.1:${port}/`); running = true; } catch {}
  assert.equal(running, false, `Port ${port} remained open after shutdown`);
}
console.info('PASS: unified shutdown releases both preview ports.');
