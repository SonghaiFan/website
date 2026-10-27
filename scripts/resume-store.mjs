import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const textFields = (value, fields) => value && fields.every((key) => typeof value[key] === 'string');
export function validDocument(value) {
  if (!value || value.schemaVersion !== 2 || !value.profile || !value.versions || !strings(value.versionOrder) || !value.versionOrder.length) return false;
  if (new Set(value.versionOrder).size !== value.versionOrder.length) return false;
  const profile = value.profile;
  if (!textFields(profile, ['name', 'aka', 'displayName', 'location', 'email', 'phone'])) return false;
  for (const key of ['links', 'contact', 'signal', 'metrics', 'methods', 'languages', 'interests', 'workingStyle', 'toolbox', 'focusAreas']) if (!strings(profile[key])) return false;
  if (!Array.isArray(profile.education) || !profile.education.every((item) => textFields(item, ['degree', 'institution', 'period']))) return false;
  if (!Array.isArray(profile.publications) || !profile.publications.every((item) => textFields(item, ['venue', 'year', 'title']))) return false;
  return Object.entries(value.versions).every(([id, version]) => {
    const content = version?.content;
    return value.versionOrder.includes(id) && version.id === id
      && ['template', 'application'].includes(version.kind)
      && ['research', 'product', 'consultant', 'visualization'].includes(version.templateKey)
      && textFields(version, ['company', 'position', 'createdAt', 'updatedAt']) && typeof version.archived === 'boolean'
      && textFields(content, ['label', 'role', 'thesis']) && strings(content.letter) && strings(content.priorities) && strings(content.skills)
      && Array.isArray(content.work) && content.work.every((item) => textFields(item, ['period', 'role', 'org']) && strings(item.points))
      && Array.isArray(content.projects) && content.projects.every((item) => textFields(item, ['title', 'meta', 'text']) && (!item.points || strings(item.points)));
  }) && value.versionOrder.every((id) => Object.hasOwn(value.versions, id));
}

export function revisionOf(text) {
  return createHash('sha256').update(text).digest('hex');
}

export class ResumeFile {
  #queue = Promise.resolve();
  constructor(vault) { this.directory = path.join(vault, '_system/private/resume'); this.file = path.join(this.directory, 'document.json'); }
  async read() {
    const raw = await fs.readFile(this.file, 'utf8');
    const document = JSON.parse(raw);
    if (!validDocument(document)) throw new Error('The private résumé file is invalid. Restore a backup before editing.');
    return { document, revision: revisionOf(raw) };
  }
  save(document, expectedRevision) {
    const operation = this.#queue.then(async () => {
      if (!validDocument(document)) throw Object.assign(new Error('Invalid résumé document'), { status: 400 });
      const current = await this.read();
      if (current.revision !== expectedRevision) throw Object.assign(new Error('The file changed elsewhere. Export your changes or reload before saving.'), { status: 409 });
      const clean = { schemaVersion: 2, profile: document.profile, versions: document.versions, versionOrder: document.versionOrder };
      const raw = JSON.stringify(clean, null, 2) + '\n';
      if (revisionOf(raw) === current.revision) return current;
      const history = path.join(this.directory, 'history');
      await fs.mkdir(history, { recursive: true, mode: 0o700 });
      await fs.writeFile(path.join(history, `${Date.now()}-${current.revision}.json`), JSON.stringify(current.document, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, raw, { mode: 0o600, flag: 'wx' });
        // Recheck after the backup/write, including changes made outside this process.
        if ((await this.read()).revision !== expectedRevision) throw Object.assign(new Error('The file changed while saving. Export your changes before reloading.'), { status: 409 });
        await fs.rename(temporary, this.file);
      } finally { await fs.rm(temporary, { force: true }); }
      return { document: clean, revision: revisionOf(raw) };
    });
    this.#queue = operation.catch(() => {});
    return operation;
  }
}
