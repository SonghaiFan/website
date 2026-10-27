import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ResumeFile } from './resume-store.mjs';
import { renderResume, promoteResume } from './resume-export.mjs';

export function resumePlugin() {
  const token = randomUUID();
  return {
    name: 'private-local-resume', apply: 'serve',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'resume-session', content: token }, injectTo: 'head-prepend' }],
    configureServer(server) {
      if (!process.env.VAULT_ROOT) throw new Error('Start the private editor with npm run dev:resume');
      const store = new ResumeFile(process.env.VAULT_ROOT);
      const exports = new Map();
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1:4176');
        if (!url.pathname.startsWith('/__local/resume')) return next();
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const reply = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
        try {
          if (req.headers.host !== '127.0.0.1:4176' || (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:4176') || req.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: 'Local editor requests only' });
          if (req.method === 'GET' && url.pathname === '/__local/resume') return reply(200, await store.read());
          const asset = url.pathname.match(/^\/__local\/resume\/exports\/([a-f0-9-]+)\/(resume.pdf|preview.png)$/);
          if (req.method === 'GET' && asset) {
            const entry = exports.get(asset[1]);
            if (!entry) return reply(404, { error: 'Export not found' });
            res.setHeader('Content-Type', asset[2] === 'resume.pdf' ? 'application/pdf' : 'image/png');
            return res.end(await fs.readFile(asset[2] === 'resume.pdf' ? entry.pdf : entry.preview));
          }
          if (!['PUT', 'POST'].includes(req.method)) return reply(405, { error: 'Method not allowed' });
          if (req.headers['x-resume-session'] !== token || req.headers.origin !== 'http://127.0.0.1:4176') return reply(403, { error: 'Invalid editor session' });
          let raw = '';
          for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw Object.assign(new Error('Document too large'), { status: 413 }); }
          const data = JSON.parse(raw);
          if (req.method === 'PUT' && url.pathname === '/__local/resume') return reply(200, await store.save(data.document, data.revision));
          if (req.method === 'POST' && url.pathname === '/__local/resume/export') {
            const current = await store.read();
            if (data.revision !== current.revision) return reply(409, { error: 'Save or reload your résumé before exporting.' });
            const entry = await renderResume(store, data);
            exports.set(entry.id, entry);
            return reply(200, { id: entry.id, pdf: `/__local/resume/exports/${entry.id}/resume.pdf`, preview: `/__local/resume/exports/${entry.id}/preview.png` });
          }
          if (req.method === 'POST' && url.pathname === '/__local/resume/promote') {
            const entry = exports.get(data.id);
            if (!entry) return reply(404, { error: 'Generate and preview a draft first.' });
            await promoteResume(store, entry);
            return reply(200, { message: 'PDF and preview updated. Commit the website changes to publish.' });
          }
          return reply(404, { error: 'Unknown editor operation' });
        } catch (error) { reply(error.status || 500, { error: error.message }); }
      });
    },
  };
}
