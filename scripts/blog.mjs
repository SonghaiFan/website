import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { root, blogRoot, vaultRoot } from './config.mjs';

const action = process.argv[2];
if (!['stage', 'dev', 'build', 'preview'].includes(action)) throw new Error('Expected stage, dev, build, or preview');
const env = { ...process.env, VAULT_ROOT: vaultRoot(), SONGHAI_BLOG_ROOT: blogRoot };
let child;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopping = true;
  child?.kill(signal);
});
function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, args, { cwd: blogRoot, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 || stopping ? resolve() : reject(new Error(`Blog ${action} failed (${signal || code})`)));
  });
}
if (action !== 'preview') await run([path.join(root, 'scripts/stage-vitepress.mjs'), env.VAULT_ROOT, path.join(blogRoot, '.stage'), blogRoot]);
if (action !== 'stage' && !stopping) {
  const require = createRequire(path.join(blogRoot, 'package.json'));
  const cli = path.join(path.dirname(require.resolve('vitepress/package.json')), 'bin/vitepress.js');
  await run([cli, action, '.stage/docs', ...(action === 'preview' ? ['--host', '127.0.0.1', '--port', '4175'] : [])]);
}
