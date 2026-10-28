import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    cors: { origin: ['https://giscus.app', /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/] },
    fs: { strict: true, allow: [import.meta.dirname] },
  },
  plugins: [{
    name: 'local-blog-links',
    apply: 'serve',
    transformIndexHtml(html) {
      return {
        html: html.replaceAll('https://blog.songhai.site', 'http://127.0.0.1:5173').replace('src="/app.js"', 'src="/app.js?local-preview"'),
        tags: [{ tag: 'meta', attrs: { name: 'songhai-blog-origin', content: 'http://127.0.0.1:5173' }, injectTo: 'head-prepend' }],
      };
    },
  }],
});
