import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { root } from './config.mjs';

export async function renderResume(store, { versionId, mode = 'visual', textScale = 1, revision }) {
  const current = await store.read();
  if (current.revision !== revision) throw Object.assign(new Error('The résumé changed. Generate a fresh preview.'), { status: 409 });
  if (!Object.hasOwn(current.document.versions, versionId) || !['visual', 'ats'].includes(mode) || ![0.9, 0.95, 1, 1.05, 1.1].includes(Number(textScale))) throw Object.assign(new Error('Invalid export options'), { status: 400 });
  const id = randomUUID();
  const directory = path.join(store.directory, 'exports', id);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const entry = { id, revision, versionId, mode, textScale, pdf: path.join(directory, 'resume.pdf'), preview: path.join(directory, 'preview.png') };
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
    const query = new URLSearchParams({ export: '1', version: versionId, mode, scale: String(textScale) });
    await page.goto(`http://127.0.0.1:4176/?${query}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('body.ready #resume .page');
    await page.evaluate(() => document.fonts.ready);
    if (await page.locator('#resume').getAttribute('data-version-id') !== versionId) throw new Error('The preview rendered a different version');
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: entry.pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
    await page.locator('#resume .page').first().screenshot({ path: entry.preview });
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(entry, null, 2) + '\n', { mode: 0o600 });
    return entry;
  } finally { await browser.close(); }
}

export async function promoteResume(store, entry, destination = path.join(root, 'apps/home/assets')) {
  if ((await store.read()).revision !== entry.revision) throw Object.assign(new Error('The résumé changed after this preview. Generate a fresh draft.'), { status: 409 });
  const files = [['resume.pdf', 'Songhai_Fan_Resume_2026.pdf'], ['preview.png', 'cv-preview.png']];
  const previous = new Map();
  for (const [, target] of files) previous.set(target, await fs.readFile(path.join(destination, target)).catch(() => null));
  try {
    for (const [source, target] of files) await fs.copyFile(path.join(path.dirname(entry.pdf), source), path.join(destination, `.${target}.next`));
    for (const [, target] of files) await fs.rename(path.join(destination, `.${target}.next`), path.join(destination, target));
  } catch (error) {
    for (const [, target] of files) {
      const backup = previous.get(target);
      if (backup) await fs.writeFile(path.join(destination, target), backup);
      else await fs.rm(path.join(destination, target), { force: true });
    }
    throw error;
  } finally { for (const [, target] of files) await fs.rm(path.join(destination, `.${target}.next`), { force: true }); }
}
