import assert from 'node:assert/strict';
import test from 'node:test';
import { engagement, startAnalytics, commentService, commentTheme, loadCommentTheme, mountComments, updateComments } from '../apps/home/engagement.js';

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
  assert.equal(children[0].src, 'https://comments.songhai.site/client.js');
  assert.deepEqual(children[0].dataset, {
    repo: engagement.repo, repoId: engagement.repoId, category: engagement.category, categoryId: engagement.categoryId,
    mapping: 'specific', term: 'blog:project:ttng', strict: '1', reactionsEnabled: '0', emitMetadata: '0',
    inputPosition: 'top', theme: 'noborder_dark', lang: 'zh-CN', loading: 'eager',
  });
  updateComments(container, { theme: 'noborder_light' });
  assert.deepEqual(message, [{ giscus: { setConfig: { theme: 'noborder_light' } } }, 'https://comments.songhai.site']);
  cleanup();
  assert.equal(children.length, 0);
});

test('home and blog use the same self-hosted service with dedicated local preview', async () => {
  assert.equal(commentService('http://127.0.0.1:4174'), 'http://127.0.0.1:4181');
  assert.equal(commentService('http://127.0.0.1:5173'), 'http://127.0.0.1:4181');
  assert.equal(commentService('https://songhai.site'), 'https://comments.songhai.site');
  assert.equal(commentService('https://blog.songhai.site'), 'https://comments.songhai.site');
  assert.equal(commentTheme(false), 'songhai_light');
  assert.equal(await loadCommentTheme(true), 'songhai_dark');
});
