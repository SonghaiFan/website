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

export function commentService(origin = globalThis.location?.origin || 'https://songhai.site') {
  return ['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)
    ? 'http://127.0.0.1:4181' : 'https://comments.songhai.site';
}

export function commentTheme(dark = false) {
  return dark ? 'songhai_dark' : 'songhai_light';
}

export async function loadCommentTheme(dark = false) {
  return commentTheme(dark);
}

export function mountComments(container, { term, title, lang = 'en', theme = commentTheme() }) {
  const script = document.createElement('script');
  script.src = `${commentService()}/client.js`;
  script.async = true;
  script.crossOrigin = 'anonymous';
  Object.assign(script.dataset, {
    repo: engagement.repo, repoId: engagement.repoId,
    category: engagement.category, categoryId: engagement.categoryId,
    mapping: 'specific', term, discussionTitle: title || term, strict: '1',
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
    { giscus: { setConfig: config } }, commentService(),
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
          mountComments(container, { term: 'home:guestbook', title: '首页留言', lang: language(), theme });
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
