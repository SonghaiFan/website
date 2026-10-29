import fs from 'node:fs';
import path from 'node:path';
export const CONFIG_FILE = '.blog-publisher.json';
export const DEFAULTS = { publicFolder: 'Blog', englishFolder: 'en', projectsFolder: 'projects', assetsFolder: 'assets', privateFolders: ['Daily', 'Notes'] };
export function validateConfig(input = {}) {
  const c = { ...DEFAULTS, ...input };
  const folder = (v) => {
    if (typeof v !== 'string' || !v || v !== v.trim() || v.split('/').some(p => !p || p.startsWith('.') || /[\\:*?"<>|\x00-\x1f]/.test(p))) throw new Error('Folders must be relative vault paths without hidden segments or traversal');
    return v;
  };
  for (const key of ['publicFolder', 'englishFolder', 'projectsFolder', 'assetsFolder']) folder(c[key]);
  if (!Array.isArray(c.privateFolders)) throw new Error('privateFolders must be an array');
  c.privateFolders.forEach(folder);
  const overlaps = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
  const roots = [c.publicFolder, c.assetsFolder, ...c.privateFolders];
  if (roots.some((a, i) => roots.slice(i + 1).some(b => overlaps(a, b))) || overlaps(c.englishFolder, c.projectsFolder)) throw new Error('Public, attachment and private folders must not overlap');
  return c;
}
export function readPublishingConfig(vault) {
  const file = path.join(vault, CONFIG_FILE);
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Publishing config cannot be a symbolic link');
  const c = validateConfig(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {});
  // Reject symlink roots/ancestors, including links to other private locations inside the vault.
  for (const relative of [c.publicFolder, c.assetsFolder, ...c.privateFolders, `${c.publicFolder}/${c.englishFolder}`, `${c.publicFolder}/${c.projectsFolder}`, `${c.publicFolder}/${c.englishFolder}/${c.projectsFolder}`]) {
    let current = vault;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Publishing directories cannot be symbolic links');
    }
  }
  return c;
}
