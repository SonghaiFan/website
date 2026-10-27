import { ResumeFile } from './resume-store.mjs';
import { vaultRoot } from './config.mjs';
import { renderResume, promoteResume } from './resume-export.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const versionId = value('--version');
if (!versionId) throw new Error('Usage: npm run cv:export -- --version <id> [--mode visual|ats] [--promote] (private editor must be running)');
const store = new ResumeFile(vaultRoot());
const { revision } = await store.read();
const entry = await renderResume(store, { versionId, revision, mode: value('--mode', 'visual'), textScale: Number(value('--scale', 1)) });
console.info(`Draft PDF: ${entry.pdf}\nDraft preview: ${entry.preview}`);
if (args.includes('--promote')) { await promoteResume(store, entry); console.info('Public PDF and preview updated; commit the website changes to publish.'); }
