import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { profile, variants } from '../apps/resume/src/data/resume.ts';

export const sampleDocument = {
  schemaVersion: 2, profile,
  versions: Object.fromEntries(Object.entries(variants).map(([key, content]) => {
    const id = `template:${key}`;
    return [id, { id, kind: 'template', company: '', position: content.label, templateKey: key, content, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archived: false }];
  })),
  versionOrder: Object.keys(variants).map((key) => `template:${key}`),
};
export async function createDemoVault(directory) {
  const write = async (file, data) => {
    const target = path.join(directory, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data, { flag: 'wx' });
  };
  await write('Blog/Example.md', '# Example note\n\nPublic example content.\n');
  await write('Blog/en/Example.md', '# Example note\n\nPublic example content.\n');
  await write('Notes/Private.md', 'PRIVATE_DEMO_SENTINEL\n');
  await write('_system/private/resume/document.json', JSON.stringify(sampleDocument, null, 2) + '\n');
  for (const brand of ['frank', 'frankie', 'franklin']) await write(`assets/2026-09-22/${brand}.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Provide a new temporary demo-vault directory');
  await createDemoVault(path.resolve(process.argv[2]));
  console.info('Created a synthetic vault with no personal data.');
}
