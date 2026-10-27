import type { ApplicationVersion, ResumeDocument, Variant, VariantKey, VersionId } from '../types';

const STORAGE_KEY = 'frank-resume-document-v2';
const LEGACY_STORAGE_KEY = 'frank-resume-document-v1';
const HISTORY_LIMIT = 50;

type StoredResumeDocument = ResumeDocument & { savedAt?: string };

type LegacyResumeDocument = {
  schemaVersion: 1;
  profile: ResumeDocument['profile'];
  variants: Record<VariantKey, Variant>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function serialise(document: ResumeDocument): string {
  return JSON.stringify(document);
}

function cleanDocument(document: ResumeDocument): ResumeDocument {
  return clone({
    schemaVersion: 2,
    profile: document.profile,
    versions: document.versions,
    versionOrder: document.versionOrder
  });
}

function isResumeDocument(value: unknown): value is ResumeDocument {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ResumeDocument>;
  return (
    candidate.schemaVersion === 2 &&
    Boolean(candidate.profile) &&
    Boolean(candidate.versions) &&
    Array.isArray(candidate.versionOrder) &&
    candidate.versionOrder.every((id) => typeof id === 'string' && Boolean(candidate.versions?.[id]))
  );
}

function isLegacyDocument(value: unknown): value is LegacyResumeDocument {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LegacyResumeDocument>;
  return candidate.schemaVersion === 1 && Boolean(candidate.profile) && Boolean(candidate.variants);
}

function pathParts(path: string, versionId: VersionId): Array<string | number> {
  const resolved = path.startsWith('variant.') ? `versions.${versionId}.content.${path.slice('variant.'.length)}` : path;
  return resolved.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function readAtPath(document: ResumeDocument, parts: Array<string | number>): unknown {
  let current: unknown = document;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[part];
  }
  return current;
}

function writeAtPath(document: ResumeDocument, parts: Array<string | number>, value: string): boolean {
  if (parts.length === 0) return false;
  let current: unknown = document;
  for (const part of parts.slice(0, -1)) {
    if (current === null || typeof current !== 'object') return false;
    current = (current as Record<string | number, unknown>)[part];
  }
  if (current === null || typeof current !== 'object') return false;
  const key = parts[parts.length - 1];
  if (key === undefined) return false;
  const previous = (current as Record<string | number, unknown>)[key];
  if (typeof previous !== 'string') return false;
  (current as Record<string | number, unknown>)[key] = value;
  return true;
}

function makeId(): VersionId {
  return typeof crypto.randomUUID === 'function'
    ? `application:${crypto.randomUUID()}`
    : `application:${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function migrateLegacy(legacy: LegacyResumeDocument, defaults: ResumeDocument): ResumeDocument {
  const next = clone(defaults);
  next.profile = clone(legacy.profile);
  for (const id of next.versionOrder) {
    const version = next.versions[id];
    if (!version || version.kind !== 'template') continue;
    const content = legacy.variants[version.templateKey];
    if (content) version.content = clone(content);
  }
  return next;
}

function versionName(version: ApplicationVersion): string {
  return version.company ? `${version.company} - ${version.position}` : version.position;
}

export class ResumeStore {
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private readonly defaults: ResumeDocument;
  private readonly defaultSerialised: string;
  private documentValue: ResumeDocument;
  private undoStack: ResumeDocument[] = [];
  private redoStack: ResumeDocument[] = [];
  private coalescingKey: string | null = null;

  constructor(defaults: ResumeDocument) {
    this.defaults = clone(defaults);
    this.defaultSerialised = serialise(this.defaults);
    this.documentValue = this.load() ?? clone(this.defaults);
    for (const id of this.defaults.versionOrder) {
      const defaultVersion = this.defaults.versions[id];
      const version = this.documentValue.versions[id];
      if (!defaultVersion || !version || version.kind !== 'template') continue;
      version.createdAt = defaultVersion.createdAt;
      version.updatedAt = defaultVersion.updatedAt;
    }
    if (!this.isDirty) localStorage.removeItem(STORAGE_KEY);
  }

  get document(): ResumeDocument {
    return this.documentValue;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get isDirty(): boolean {
    return serialise(this.documentValue) !== this.defaultSerialised;
  }

  read(path: string, versionId: VersionId): string | undefined {
    const value = readAtPath(this.documentValue, pathParts(path, versionId));
    return typeof value === 'string' ? value : undefined;
  }

  commit(path: string, versionId: VersionId, value: string, coalescingKey?: string): boolean {
    const normalised = value.replaceAll('\r\n', '\n').trim();
    const parts = pathParts(path, versionId);
    const previous = readAtPath(this.documentValue, parts);
    if (typeof previous !== 'string' || previous === normalised) return false;

    const next = clone(this.documentValue);
    if (!writeAtPath(next, parts, normalised)) return false;
    if (!coalescingKey || this.coalescingKey !== coalescingKey) this.pushUndo(this.documentValue);
    this.coalescingKey = coalescingKey ?? null;
    const version = next.versions[versionId];
    if (version) version.updatedAt = new Date().toISOString();
    this.documentValue = next;
    this.redoStack = [];
    this.persist();
    return true;
  }

  createVersion(company: string, position: string, sourceId: VersionId): VersionId | null {
    const source = this.documentValue.versions[sourceId];
    if (!source) return null;
    const now = new Date().toISOString();
    const id = makeId();
    const next = clone(this.documentValue);
    next.versions[id] = {
      id,
      kind: 'application',
      company: company.trim(),
      position: position.trim(),
      templateKey: source.templateKey,
      content: clone(source.content),
      createdAt: now,
      updatedAt: now,
      archived: false
    };
    next.versions[id].content.label = versionName(next.versions[id]);
    next.versions[id].content.role = position.trim();
    next.versionOrder.push(id);
    this.replaceDocument(next);
    return id;
  }

  duplicateVersion(sourceId: VersionId): VersionId | null {
    const source = this.documentValue.versions[sourceId];
    if (!source) return null;
    const now = new Date().toISOString();
    const id = makeId();
    const next = clone(this.documentValue);
    const position = source.kind === 'template' ? source.position : `${source.position} Copy`;
    next.versions[id] = {
      ...clone(source),
      id,
      kind: 'application',
      position,
      content: clone(source.content),
      createdAt: now,
      updatedAt: now,
      archived: false
    };
    next.versions[id].content.label = versionName(next.versions[id]);
    next.versionOrder.push(id);
    this.replaceDocument(next);
    return id;
  }

  renameVersion(id: VersionId, company: string, position: string): boolean {
    const current = this.documentValue.versions[id];
    if (!current || current.kind === 'template') return false;
    const nextCompany = company.trim();
    const nextPosition = position.trim();
    if (!nextPosition || (current.company === nextCompany && current.position === nextPosition)) return false;
    const next = clone(this.documentValue);
    const version = next.versions[id];
    if (!version) return false;
    const roleFollowedPosition = version.content.role === current.position;
    version.company = nextCompany;
    version.position = nextPosition;
    version.content.label = versionName(version);
    if (roleFollowedPosition) version.content.role = nextPosition;
    version.updatedAt = new Date().toISOString();
    this.replaceDocument(next);
    return true;
  }

  toggleArchive(id: VersionId): boolean {
    const current = this.documentValue.versions[id];
    if (!current || current.kind === 'template') return false;
    const next = clone(this.documentValue);
    const version = next.versions[id];
    if (!version) return false;
    version.archived = !version.archived;
    version.updatedAt = new Date().toISOString();
    this.replaceDocument(next);
    return true;
  }

  deleteVersion(id: VersionId): boolean {
    const current = this.documentValue.versions[id];
    if (!current || current.kind === 'template') return false;
    const next = clone(this.documentValue);
    delete next.versions[id];
    next.versionOrder = next.versionOrder.filter((versionId) => versionId !== id);
    this.replaceDocument(next);
    return true;
  }

  importJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const next = isResumeDocument(parsed)
        ? cleanDocument(parsed)
        : isLegacyDocument(parsed)
          ? migrateLegacy(parsed, this.defaults)
          : null;
      if (!next) return false;
      this.replaceDocument(next);
      return true;
    } catch {
      return false;
    }
  }

  exportJson(): string {
    return JSON.stringify(this.documentValue, null, 2);
  }

  endCoalescing(): void {
    this.coalescingKey = null;
  }

  cancelCoalescing(): boolean {
    if (!this.coalescingKey) return false;
    const previous = this.undoStack.pop();
    this.coalescingKey = null;
    if (!previous) return false;
    this.documentValue = previous;
    this.redoStack = [];
    this.persist();
    return true;
  }

  undo(): boolean {
    this.coalescingKey = null;
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(clone(this.documentValue));
    this.documentValue = previous;
    this.persist();
    return true;
  }

  redo(): boolean {
    this.coalescingKey = null;
    const next = this.redoStack.pop();
    if (!next) return false;
    this.pushUndo(this.documentValue);
    this.documentValue = next;
    this.persist();
    return true;
  }

  reset(): boolean {
    if (!this.isDirty) return false;
    this.coalescingKey = null;
    this.pushUndo(this.documentValue);
    this.documentValue = clone(this.defaults);
    this.redoStack = [];
    localStorage.removeItem(STORAGE_KEY);
    this.listeners.forEach((listener) => listener());
    return true;
  }

  private replaceDocument(next: ResumeDocument): void {
    this.coalescingKey = null;
    this.pushUndo(this.documentValue);
    this.documentValue = next;
    this.redoStack = [];
    this.persist();
  }

  private pushUndo(document: ResumeDocument): void {
    this.undoStack.push(clone(document));
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
  }

  private load(): ResumeDocument | null {
    try {
      const currentRaw = localStorage.getItem(STORAGE_KEY);
      if (currentRaw) {
        const current = JSON.parse(currentRaw) as unknown;
        if (isResumeDocument(current)) return cleanDocument(current);
      }
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacyRaw) return null;
      const legacy = JSON.parse(legacyRaw) as unknown;
      if (!isLegacyDocument(legacy)) return null;
      const migrated = migrateLegacy(legacy, this.defaults);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch {
      return null;
    }
  }

  private persist(): void {
    this.listeners.forEach((listener) => listener());
    if (!this.isDirty) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const stored: StoredResumeDocument = { ...clone(this.documentValue), savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }
}
