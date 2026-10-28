// These IDs are public embed configuration, never API credentials.
export const engagement = Object.freeze({
  analytics: {
    'songhai.site': '74e5da90912d47c995cc191517c40037',
    'blog.songhai.site': '855908c1007742be8a64bac5cc8ee26c',
  },
  repo: 'SonghaiFan/website',
  repoId: 'R_kgDOVYyQ6Q',
  category: 'Announcements',
  categoryId: 'DIC_kwDOVYyQ6c4DJyNw',
});

export function startAnalytics(doc = document, hostname = location.hostname) {
  const token = engagement.analytics[hostname];
  if (!token || doc.querySelector('script[data-songhai-analytics]')) return;
  const script = doc.createElement('script');
  script.type = 'module';
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.defer = true;
  script.dataset.songhaiAnalytics = '';
  script.dataset.cfBeacon = JSON.stringify({ token, spa: true });
  doc.head.append(script);
}

export function commentTheme(dark = false, origin = location.origin) {
  // Runtime iframe links bypass Vite's HTML transform, so local styles need
  // its direct-CSS mode rather than the JavaScript module response.
  const local = ['127.0.0.1', 'localhost'].includes(new URL(origin).hostname);
  return `${origin}/giscus${dark ? '-dark' : ''}.css?${local ? 'direct&' : ''}v=20261028-hierarchy`;
}

export async function loadCommentTheme(dark = false, origin = location.origin, request = fetch) {
  const url = commentTheme(dark, origin);
  if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) return url;
  // The HTTPS widget cannot reliably request loopback HTTP styles. Read them
  // from the local parent and give the widget the identical CSS as a data URL.
  const responses = await Promise.all([
    request(url), request(`${origin}/giscus-base.css?direct&v=20261028-hierarchy`),
  ]);
  if (responses.some((response) => !response.ok)) throw new Error('Comment preview theme unavailable');
  const [palette, base] = await Promise.all(responses.map((response) => response.text()));
  const css = palette.replace(/@import url\("\.\/giscus-base\.css[^\"]*"\);/, base)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').trim();
  return `data:text/css;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(css)))}`;
}

export function mountComments(container, { term, lang = 'en', theme = commentTheme() }) {
  const script = document.createElement('script');
  script.src = 'https://giscus.app/client.js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  Object.assign(script.dataset, {
    repo: engagement.repo, repoId: engagement.repoId,
    category: engagement.category, categoryId: engagement.categoryId,
    mapping: 'specific', term, strict: '1',
    reactionsEnabled: '0', emitMetadata: '0', inputPosition: 'top',
    // Callers already defer mounting until the guestbook opens or the article
    // ends. Load the iframe immediately once the reader reaches that point.
    theme, lang, loading: 'eager',
  });
  container.replaceChildren(script);
  return () => container.replaceChildren();
}

export function updateComments(container, config) {
  container.querySelector('iframe.giscus-frame')?.contentWindow?.postMessage(
    { giscus: { setConfig: config } }, 'https://giscus.app',
  );
}

if (typeof window !== 'undefined') startAnalytics();

// The homepage guestbook opens on request, keeping the conversation lightweight.
if (typeof document !== 'undefined') {
  const dialog = document.querySelector('#guestbook');
  const button = document.querySelector('#open-guestbook');
  if (dialog && button) {
    const container = dialog.querySelector('.giscus');
    let mounted = false;
    const language = () => document.documentElement.lang.startsWith('zh') ? 'zh-CN' : 'en';
    button.addEventListener('click', async () => {
      dialog.showModal();
      if (!mounted) {
        mounted = true;
        try {
          const theme = await loadCommentTheme();
          mountComments(container, { term: 'home:guestbook', lang: language(), theme });
        } catch (error) {
          mounted = false;
          console.warn('[comments]', error);
        }
      }
    });
    dialog.querySelector('.guestbook-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    } });
    document.addEventListener('songhai:language', () => updateComments(container, { lang: language() }));
  }
}
