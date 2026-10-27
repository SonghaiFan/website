import { spawnSync } from 'node:child_process';
for (const [name, url] of [['Home','https://songhai.site'],['Blog','https://blog.songhai.site']]) {
  try { const response = await fetch(`${url}/build.json`, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); console.info(`${name}:`, await response.json()); }
  catch (error) { console.info(`${name}: ${error.message}`); }
}
for (const repo of ['SonghaiFan/website','SonghaiFan/frank_home','SonghaiFan/knowledge']) {
  const token = spawnSync('gh', ['auth','token','--user','SonghaiFan'], { encoding:'utf8' });
  if (token.status !== 0) { console.info(`Actions: https://github.com/${repo}/actions (sign in as SonghaiFan for private status)`); continue; }
  const result = spawnSync('gh', ['run','list','-R',repo,'--limit','1','--json','status,conclusion,url,headSha'], { encoding:'utf8',env:{...process.env,GH_TOKEN:token.stdout.trim()} });
  console.info(repo + ': ' + (result.status === 0 ? result.stdout.trim() : `https://github.com/${repo}/actions`));
}
