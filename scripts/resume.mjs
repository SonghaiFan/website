import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, vaultRoot } from './config.mjs';

if (process.argv[2] !== 'dev') throw new Error('Expected dev');
const child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js')], {
  cwd: path.join(root, 'apps/resume'), env: { ...process.env, VAULT_ROOT: vaultRoot() }, stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('exit', (code) => { process.exitCode = code || 0; });
