import assert from 'node:assert/strict';
import test from 'node:test';
import { engagement, startAnalytics, commentTheme, loadCommentTheme, mountComments, updateComments } from '../apps/home/engagement.js';

function documentFixture() {
  const scripts = [];
  return {
    scripts,
    createElement: () => ({ dataset: {} }),
    querySelector: () => scripts[0],
    head: { append: (script) => scripts.push(script) },
  };
}

test('analytics runs only on the two production hosts and installs once', () => {
  for (const host of ['127.0.0.1', 'localhost', 'website.pages.dev', 'api.songhai.site', 'songhai.site.example.com']) {
    const doc = documentFixture();
    startAnalytics(doc, host);
    assert.equal(doc.scripts.length, 0, host);
  }
  for (const host of ['songhai.site', 'blog.songhai.site']) {
    const doc = documentFixture();
    startAnalytics(doc, host);
    startAnalytics(doc, host);
    assert.equal(doc.scripts.length, 1);
    assert.equal(doc.scripts[0].type, 'module');
    const beacon = JSON.parse(doc.scripts[0].dataset.cfBeacon);
    assert.equal(beacon.token, engagement.analytics[host]);
    assert.equal(beacon.spa, true);
  }
  assert.notEqual(engagement.analytics['songhai.site'], engagement.analytics['blog.songhai.site']);
});

test('comments use strict stable keys and update only the trusted Giscus frame', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentFixture() });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  let children;
  let message;
  const container = {
    replaceChildren: (...next) => { children = next; },
    querySelector: () => ({ contentWindow: { postMessage: (...args) => { message = args; } } }),
  };
  const cleanup = mountComments(container, { term: 'blog:project:ttng', lang: 'zh-CN', theme: 'noborder_dark' });
  assert.equal(children.length, 1);
  assert.deepEqual(children[0].dataset, {
    repo: engagement.repo, repoId: engagement.repoId, category: engagement.category, categoryId: engagement.categoryId,
    mapping: 'specific', term: 'blog:project:ttng', strict: '1', reactionsEnabled: '0', emitMetadata: '0',
    inputPosition: 'top', theme: 'noborder_dark', lang: 'zh-CN', loading: 'eager',
  });
  updateComments(container, { theme: 'noborder_light' });
  assert.deepEqual(message, [{ giscus: { setConfig: { theme: 'noborder_light' } } }, 'https://giscus.app']);
  cleanup();
  assert.equal(children.length, 0);
});

test('custom comment themes follow the embedding site and selected appearance', () => {
  assert.equal(commentTheme(false, 'http://127.0.0.1:4174'), 'http://127.0.0.1:4174/giscus.css?direct&v=20261028-minimal');
  assert.equal(commentTheme(true, 'https://blog.songhai.site'), 'https://blog.songhai.site/giscus-dark.css?v=20261028-minimal');
});

test('local previews inline the same CSS while production serves the theme directly', async () => {
  const request = async (url) => ({ ok: true, text: async () => url.includes('giscus-base')
    ? 'main { border: 0; }' : '@import url("https://giscus.app/themes/noborder_light.css"); @import url("./giscus-base.css?direct&v=1"); :root { color-scheme: light; }' });
  const preview = await loadCommentTheme(false, 'http://127.0.0.1:4174', request);
  assert.match(preview, /^data:text\/css;base64,/);
  const css = Buffer.from(preview.split(',')[1], 'base64').toString();
  assert.match(css, /main\{border: 0;\}/);
  assert.doesNotMatch(css, /@import.*giscus-base/);
  assert.equal(await loadCommentTheme(true, 'https://blog.songhai.site', () => { throw new Error('Must not fetch'); }),
    'https://blog.songhai.site/giscus-dark.css?v=20261028-minimal');
});
