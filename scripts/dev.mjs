import net from 'node:net';
import { spawn } from 'node:child_process';
import { root, vaultRoot } from './config.mjs';

vaultRoot();
// Refuse busy ports instead of silently opening a different app or port.
for (const port of [4174, 5173, 4176]) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is busy. Stop the previous preview before running npm run dev.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  const timer = setTimeout(() => {
    for (const child of children) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }, 3000);
  timer.unref();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const workspace of ['@songhai/home', '@songhai/blog', '@songhai/resume']) {
  const child = spawn('npm', ['run', 'dev', '--workspace', workspace], { cwd: root, stdio: 'inherit', detached: true });
  children.push(child);
  child.once('error', (error) => { console.error(error); stop(1); });
  child.once('exit', (code) => { if (!stopping) stop(code || 1); });
}
console.info('Home: http://127.0.0.1:4174/\nBlog: http://127.0.0.1:5173/zh/\nResume: http://127.0.0.1:4176/\nCtrl+C stops all previews.');
