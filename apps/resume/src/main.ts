import './styles.css';
import { AtsCoverLetter, AtsResume, wrapAtsPage } from './components/AtsResume';
import { Shell, syncShellControls, versionLabel } from './components/Shell';
import { VisualCoverLetter, VisualResume, wrapVisualPage } from './components/VisualResume';
import { profile, variants } from './data/resume';
import { ResumeStore } from './editor/store';
import { loadPrivateDocument, connectPrivateStore } from './editor/private';
import type { ApplicationVersion, AppState, EditKind, EditScope, EditSegment, LayoutMetrics, ResumeDocument, ResumeMode, VariantKey, VersionId } from './types';
import { clearTextCache, setTextScale } from './utils/textRenderer';

const TEMPLATE_TIMESTAMP = '2026-08-30T00:00:00.000Z';
const templateEntries = (Object.entries(variants) as Array<[VariantKey, (typeof variants)[VariantKey]]>).map(([key, content]) => {
  const id = `template:${key}`;
  return [
    id,
    {
      id,
      kind: 'template',
      company: '',
      position: content.label,
      templateKey: key,
      content,
      createdAt: TEMPLATE_TIMESTAMP,
      updatedAt: TEMPLATE_TIMESTAMP,
      archived: false
    } satisfies ApplicationVersion
  ] as const;
});

const defaultDocument: ResumeDocument = {
  schemaVersion: 2,
  profile,
  versions: Object.fromEntries(templateEntries),
  versionOrder: templateEntries.map(([id]) => id)
};

const resumeStore = new ResumeStore(await loadPrivateDocument(defaultDocument));
const ACTIVE_VERSION_KEY = 'frank-resume-active-version-v1';
const storedVersionId = localStorage.getItem(ACTIVE_VERSION_KEY);

const state: AppState = {
  currentVersionId: storedVersionId && resumeStore.document.versions[storedVersionId] ? storedVersionId : 'template:product',
  currentMode: 'visual',
  includeCoverLetter: false,
  textScale: 1,
  isEditing: false
};

const exportQuery = new URLSearchParams(location.search);
if (exportQuery.has('export')) {
  const selected = exportQuery.get('version') || '';
  if (!resumeStore.document.versions[selected]) throw new Error('Unknown résumé version');
  state.currentVersionId = selected;
  state.currentMode = exportQuery.get('mode') === 'ats' ? 'ats' : 'visual';
  state.textScale = Number(exportQuery.get('scale') || 1);
  state.includeCoverLetter = false;
}

let metrics: LayoutMetrics = {
  mainWidth: 492,
  heroMetaWidth: 260,
  sectionWidth: 428,
  sideWidth: 166,
  projectWidth: 206
};

let scheduledRender: number | null = null;

type ActiveEdit = {
  versionId: VersionId;
  path: string;
  label: string;
  kind: EditKind;
  scope: EditScope;
  segment?: EditSegment;
  target: HTMLElement;
  coalescingKey: string;
};

let activeEdit: ActiveEdit | null = null;
let versionDialogMode: 'create' | 'rename' = 'create';

function fallbackVersionId(): VersionId {
  const document = resumeStore.document;
  return (
    document.versionOrder.find((id) => document.versions[id]?.kind === 'application' && !document.versions[id]?.archived) ??
    document.versionOrder.find((id) => document.versions[id]?.kind === 'template') ??
    document.versionOrder[0] ??
    ''
  );
}

function ensureCurrentVersion(): void {
  if (!resumeStore.document.versions[state.currentVersionId]) state.currentVersionId = fallbackVersionId();
  if (state.currentVersionId) localStorage.setItem(ACTIVE_VERSION_KEY, state.currentVersionId);
}

function measureLayout(): void {
  const root = document.querySelector<HTMLElement>('#measure-root');
  if (!root) return;

  root.innerHTML = `
    <section class="page">
      <header class="resume-hero">
        <div></div>
        <div class="hero-meta"></div>
      </header>
      <div class="content-grid">
        <section class="main-col">
          <section class="resume-section">
            <div class="section-kicker">00</div>
            <div class="section-measure"></div>
          </section>
          <section class="resume-section">
            <div class="section-kicker">01</div>
            <div class="project-grid">
              <div class="project-card"></div>
              <div class="project-card"></div>
            </div>
          </section>
        </section>
        <aside class="side-col">
          <div class="side-measure"></div>
        </aside>
      </div>
    </section>
  `;

  const main = root.querySelector<HTMLElement>('.main-col');
  const heroMeta = root.querySelector<HTMLElement>('.hero-meta');
  const section = root.querySelector<HTMLElement>('.section-measure');
  const side = root.querySelector<HTMLElement>('.side-measure');
  const project = root.querySelector<HTMLElement>('.project-card');

  metrics = {
    mainWidth: main?.clientWidth || metrics.mainWidth,
    heroMetaWidth: heroMeta?.clientWidth || metrics.heroMetaWidth,
    sectionWidth: section?.clientWidth || metrics.sectionWidth,
    sideWidth: side?.clientWidth || metrics.sideWidth,
    projectWidth: project?.clientWidth || metrics.projectWidth
  };
}

function renderVisual(): string {
  const document = resumeStore.document;
  const version = document.versions[state.currentVersionId] ?? document.versions[document.versionOrder[0] ?? ''];
  if (!version) return '';
  const variant = version.content;

  return [
    state.includeCoverLetter ? wrapVisualPage(VisualCoverLetter({ profile: document.profile, variant, metrics })) : '',
    wrapVisualPage(VisualResume({ profile: document.profile, variant, variantKey: version.templateKey, metrics }))
  ].join('');
}

function renderAts(): string {
  const document = resumeStore.document;
  const version = document.versions[state.currentVersionId] ?? document.versions[document.versionOrder[0] ?? ''];
  if (!version) return '';
  const variant = version.content;

  return [
    state.includeCoverLetter ? wrapAtsPage(AtsCoverLetter({ profile: document.profile, variant })) : '',
    wrapAtsPage(AtsResume({ profile: document.profile, variant }))
  ].join('');
}

function updatePreviewScale(): void {
  const firstPage = document.querySelector<HTMLElement>('#resume .page');
  if (!firstPage) return;

  const availableWidth = Math.max(280, window.innerWidth - 24);
  const scaleValue = Math.min(1, availableWidth / firstPage.offsetWidth);
  document.documentElement.style.setProperty('--preview-scale', String(Math.floor(scaleValue * 1000) / 1000));
}

function render(): void {
  if (activeEdit) finishInlineEdit(false);
  ensureCurrentVersion();
  document.documentElement.style.setProperty('--text-scale', String(state.textScale));
  setTextScale(state.textScale);
  measureLayout();

  const resume = document.querySelector<HTMLElement>('#resume');
  if (resume) {
    resume.dataset.versionId = state.currentVersionId;
    resume.innerHTML = state.currentMode === 'visual' ? renderVisual() : renderAts();
  }

  updatePreviewScale();
  syncShellControls(state, resumeStore.document);
  syncEditorUi();
  requestAnimationFrame(() => {
    document.body.classList.add('ready');
    validateLayout();
  });
}

function scheduleRender(): void {
  if (scheduledRender !== null) return;

  scheduledRender = requestAnimationFrame(() => {
    scheduledRender = null;
    render();
  });
}

function setVersion(next: string): void {
  if (next in resumeStore.document.versions) {
    state.currentVersionId = next;
    localStorage.setItem(ACTIVE_VERSION_KEY, next);
    scheduleRender();
  }
}

function setMode(next?: string): void {
  if (next === 'visual' || next === 'ats') {
    state.currentMode = next as ResumeMode;
    scheduleRender();
  }
}

function setEditing(next: boolean): void {
  if (state.isEditing === next) return;
  if (activeEdit) finishInlineEdit(false);
  state.isEditing = next;
  render();
}

function syncEditorUi(): void {
  document.body.classList.toggle('editing', state.isEditing);

  const toolbar = document.querySelector<HTMLElement>('#editorToolbar');
  if (toolbar) toolbar.hidden = !state.isEditing;

  const status = document.querySelector<HTMLOutputElement>('#editorStatus');
  if (status) {
    status.textContent = activeEdit
      ? `${activeEdit.label} - ${activeEdit.scope === 'shared' ? 'all versions' : 'current version'}`
      : resumeStore.isDirty
        ? 'Saved locally'
        : 'Default copy';
  }

  const undoButton = document.querySelector<HTMLButtonElement>('#undoButton');
  if (undoButton) undoButton.disabled = !resumeStore.canUndo;

  const redoButton = document.querySelector<HTMLButtonElement>('#redoButton');
  if (redoButton) redoButton.disabled = !resumeStore.canRedo;

  const resetButton = document.querySelector<HTMLButtonElement>('#resetButton');
  if (resetButton) resetButton.disabled = !resumeStore.isDirty;

  document.querySelectorAll<HTMLElement>('#resume [data-edit-path]').forEach((element) => {
    if (state.isEditing) {
      element.tabIndex = 0;
      element.setAttribute('role', element === activeEdit?.target ? 'textbox' : 'button');
    } else {
      element.removeAttribute('tabindex');
      element.removeAttribute('role');
      element.removeAttribute('contenteditable');
    }
  });
}

function validateLayout(): void {
  const warning = document.querySelector<HTMLOutputElement>('#layoutWarning');
  if (!warning) return;

  const rows = Array.from(document.querySelectorAll<HTMLElement>('#resume .text-row'));
  const clippedRows = rows.filter((row) => row.scrollWidth > row.clientWidth + 1).length;
  const overflowingPages = Array.from(document.querySelectorAll<HTMLElement>('#resume .page:not(.ats-page)')).filter(
    (page) => page.scrollHeight > page.clientHeight + 1
  ).length;

  const issues: string[] = [];
  if (clippedRows > 0) issues.push(`${clippedRows} text ${clippedRows === 1 ? 'line is' : 'lines are'} clipped`);
  if (overflowingPages > 0) issues.push(`${overflowingPages} ${overflowingPages === 1 ? 'page exceeds' : 'pages exceed'} A4 height`);

  warning.hidden = !state.isEditing || issues.length === 0;
  warning.textContent = issues.length > 0 ? `Layout warning: ${issues.join('; ')}.` : '';
}

function segmentValue(value: string, segment?: EditSegment): string {
  if (!segment) return value;
  const [firstName = '', ...lastParts] = value.trim().split(/\s+/u);
  return segment === 'first-name' ? firstName : lastParts.join(' ');
}

function storeValue(edit: ActiveEdit, visibleValue: string): string {
  if (!edit.segment) return visibleValue;
  const current = resumeStore.read(edit.path, edit.versionId) ?? '';
  const [firstName = '', ...lastParts] = current.trim().split(/\s+/u);
  return edit.segment === 'first-name'
    ? [visibleValue.trim(), ...lastParts].filter(Boolean).join(' ')
    : [firstName, visibleValue.trim()].filter(Boolean).join(' ');
}

function editableText(target: HTMLElement, kind: EditKind): string {
  const value = target.innerText.replaceAll('\u00a0', ' ').replaceAll('\r\n', '\n');
  return kind === 'single' ? value.replace(/\s*\n+\s*/gu, ' ') : value;
}

function placeCaretAtEnd(target: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAtPoint(target: HTMLElement, x?: number, y?: number): void {
  if (x === undefined || y === undefined) {
    placeCaretAtEnd(target);
    return;
  }

  const documentWithCaret = document as Document & {
    caretPositionFromPoint?: (clientX: number, clientY: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null;
  };
  const position = documentWithCaret.caretPositionFromPoint?.(x, y);
  const range = position ? document.createRange() : documentWithCaret.caretRangeFromPoint?.(x, y);
  if (position && range) {
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
  }
  if (!range || !target.contains(range.startContainer)) {
    placeCaretAtEnd(target);
    return;
  }

  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function commitInlineValue(edit: ActiveEdit): boolean {
  return resumeStore.commit(
    edit.path,
    edit.versionId,
    storeValue(edit, editableText(edit.target, edit.kind)),
    edit.coalescingKey
  );
}

function beginInlineEdit(target: HTMLElement, point?: { x: number; y: number }): void {
  if (!state.isEditing) return;
  const path = target.dataset.editPath;
  const label = target.dataset.editLabel;
  const kind = target.dataset.editKind as EditKind | undefined;
  const scope = target.dataset.editScope as EditScope | undefined;
  const segment = target.dataset.editSegment as EditSegment | undefined;
  if (!path || !label || !kind || !scope) return;

  const value = resumeStore.read(path, state.currentVersionId);
  if (value === undefined) return;

  const textRow = target.querySelector<HTMLElement>('.text-row');
  const minimumHeight = target.offsetHeight;
  if (textRow) {
    const rowStyle = window.getComputedStyle(textRow);
    target.style.font = rowStyle.font;
    target.style.lineHeight = rowStyle.lineHeight;
    target.style.height = 'auto';
    target.style.minHeight = `${minimumHeight}px`;
  }

  activeEdit = {
    versionId: state.currentVersionId,
    path,
    label,
    kind,
    scope,
    segment,
    target,
    coalescingKey: `${state.currentVersionId}:${path}:${segment ?? 'all'}`
  };
  target.textContent = segmentValue(value, segment);
  target.classList.add('is-inline-editing');
  target.setAttribute('contenteditable', 'plaintext-only');
  target.setAttribute('role', 'textbox');
  target.setAttribute('aria-multiline', String(kind === 'multiline'));
  target.setAttribute('spellcheck', 'true');
  syncEditorUi();
  target.focus({ preventScroll: true });
  placeCaretAtPoint(target, point?.x, point?.y);
}

function finishInlineEdit(renderAfter = true, cancel = false): void {
  const edit = activeEdit;
  if (!edit) return;
  activeEdit = null;

  if (cancel) {
    resumeStore.cancelCoalescing();
  } else {
    commitInlineValue(edit);
    resumeStore.endCoalescing();
  }

  edit.target.removeAttribute('contenteditable');
  edit.target.removeAttribute('aria-multiline');
  edit.target.removeAttribute('spellcheck');
  edit.target.classList.remove('is-inline-editing');
  clearTextCache();
  if (renderAfter) render();
}

function applyHistory(action: 'undo' | 'redo'): void {
  const changed = action === 'undo' ? resumeStore.undo() : resumeStore.redo();
  if (!changed) return;
  clearTextCache();
  render();
}

function currentVersion(): ApplicationVersion | undefined {
  return resumeStore.document.versions[state.currentVersionId];
}

function closeVersionMenu(): void {
  const menu = document.querySelector<HTMLElement>('#versionMenu');
  const button = document.querySelector<HTMLButtonElement>('#manageVersionButton');
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

function showVersionNotice(message: string): void {
  const notice = document.querySelector<HTMLOutputElement>('#versionNotice');
  if (!notice) return;
  notice.textContent = message;
  notice.hidden = false;
  window.setTimeout(() => {
    if (notice.textContent === message) notice.hidden = true;
  }, 2600);
}

function openVersionDialog(mode: 'create' | 'rename'): void {
  const dialog = document.querySelector<HTMLDialogElement>('#versionDialog');
  const title = document.querySelector<HTMLElement>('#versionDialogTitle');
  const description = document.querySelector<HTMLElement>('#versionDialogDescription');
  const company = document.querySelector<HTMLInputElement>('#versionCompany');
  const position = document.querySelector<HTMLInputElement>('#versionPosition');
  const sourceField = document.querySelector<HTMLElement>('#versionSourceField');
  const source = document.querySelector<HTMLSelectElement>('#versionSource');
  const save = document.querySelector<HTMLButtonElement>('#saveVersionButton');
  const error = document.querySelector<HTMLOutputElement>('#versionFormError');
  if (!dialog || !title || !description || !company || !position || !sourceField || !source || !save || !error) return;

  versionDialogMode = mode;
  closeVersionMenu();
  error.textContent = '';
  if (mode === 'create') {
    title.textContent = 'New application version';
    description.textContent = 'Create a tailored résumé for one company and position.';
    company.value = '';
    position.value = '';
    source.value = state.currentVersionId;
    sourceField.hidden = false;
    save.textContent = 'Create version';
  } else {
    const version = currentVersion();
    if (!version || version.kind === 'template') return;
    title.textContent = 'Rename version';
    description.textContent = 'Update the application target without changing its résumé content.';
    company.value = version.company;
    position.value = version.position;
    sourceField.hidden = true;
    save.textContent = 'Save';
  }
  dialog.showModal();
  requestAnimationFrame(() => company.focus());
}

function downloadVersions(): void {
  closeVersionMenu();
  const blob = new Blob([resumeStore.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `frank-resume-versions-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showVersionNotice('All versions exported.');
}

function renderAfterVersionChange(nextId?: VersionId): void {
  if (nextId) state.currentVersionId = nextId;
  ensureCurrentVersion();
  closeVersionMenu();
  clearTextCache();
  render();
}

function attachEvents(): void {
  document.querySelector<HTMLSelectElement>('#versionSelect')?.addEventListener('change', (event) => {
    setVersion((event.target as HTMLSelectElement).value);
  });

  document.querySelector<HTMLButtonElement>('#newVersionButton')?.addEventListener('click', () => openVersionDialog('create'));
  document.querySelector<HTMLButtonElement>('#manageVersionButton')?.addEventListener('click', (event) => {
    event.stopPropagation();
    const menu = document.querySelector<HTMLElement>('#versionMenu');
    const button = event.currentTarget as HTMLButtonElement;
    if (!menu) return;
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.querySelector<HTMLElement>('#versionMenu')?.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => closeVersionMenu());

  document.querySelector<HTMLButtonElement>('#cancelVersionButton')?.addEventListener('click', () => {
    document.querySelector<HTMLDialogElement>('#versionDialog')?.close();
  });
  document.querySelector<HTMLFormElement>('#versionForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const company = document.querySelector<HTMLInputElement>('#versionCompany')?.value.trim() ?? '';
    const position = document.querySelector<HTMLInputElement>('#versionPosition')?.value.trim() ?? '';
    const sourceId = document.querySelector<HTMLSelectElement>('#versionSource')?.value ?? state.currentVersionId;
    const error = document.querySelector<HTMLOutputElement>('#versionFormError');
    if (!company || !position) {
      if (error) error.textContent = 'Company and position are required.';
      return;
    }

    if (versionDialogMode === 'create') {
      const id = resumeStore.createVersion(company, position, sourceId);
      if (!id) {
        if (error) error.textContent = 'The selected starting version is unavailable.';
        return;
      }
      state.isEditing = true;
      document.querySelector<HTMLDialogElement>('#versionDialog')?.close();
      renderAfterVersionChange(id);
      showVersionNotice('Application version created.');
    } else {
      if (!resumeStore.renameVersion(state.currentVersionId, company, position)) {
        if (error) error.textContent = 'Nothing changed.';
        return;
      }
      document.querySelector<HTMLDialogElement>('#versionDialog')?.close();
      renderAfterVersionChange();
      showVersionNotice('Version renamed.');
    }
  });
  document.querySelector<HTMLButtonElement>('#duplicateVersionButton')?.addEventListener('click', () => {
    if (currentVersion()?.kind === 'template') {
      openVersionDialog('create');
      return;
    }
    const id = resumeStore.duplicateVersion(state.currentVersionId);
    if (!id) return;
    renderAfterVersionChange(id);
    showVersionNotice('Version duplicated.');
  });
  document.querySelector<HTMLButtonElement>('#renameVersionButton')?.addEventListener('click', () => openVersionDialog('rename'));
  document.querySelector<HTMLButtonElement>('#archiveVersionButton')?.addEventListener('click', () => {
    const version = currentVersion();
    if (!version || !resumeStore.toggleArchive(version.id)) return;
    const action = version.archived ? 'restored' : 'archived';
    renderAfterVersionChange();
    showVersionNotice(`Version ${action}.`);
  });
  document.querySelector<HTMLButtonElement>('#deleteVersionButton')?.addEventListener('click', () => {
    const version = currentVersion();
    if (!version || version.kind === 'template') return;
    if (!window.confirm(`Delete ${versionLabel(version)}? This can be undone until the page is reloaded.`)) return;
    if (!resumeStore.deleteVersion(version.id)) return;
    renderAfterVersionChange();
    showVersionNotice('Version deleted.');
  });
  document.querySelector<HTMLButtonElement>('#exportVersionsButton')?.addEventListener('click', downloadVersions);
  document.querySelector<HTMLButtonElement>('#importVersionsButton')?.addEventListener('click', () => {
    closeVersionMenu();
    document.querySelector<HTMLInputElement>('#versionImportInput')?.click();
  });
  document.querySelector<HTMLInputElement>('#versionImportInput')?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!window.confirm('Importing will replace the current version library. Continue?')) return;
    const raw = await file.text();
    if (!resumeStore.importJson(raw)) {
      showVersionNotice('Import failed. Choose a valid résumé backup.');
      return;
    }
    state.currentVersionId = fallbackVersionId();
    renderAfterVersionChange();
    showVersionNotice('Version library imported.');
  });

  document.querySelector<HTMLInputElement>('#coverLetterToggle')?.addEventListener('change', (event) => {
    state.includeCoverLetter = (event.target as HTMLInputElement).checked;
    scheduleRender();
  });

  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  document.querySelector<HTMLInputElement>('#textScaleSlider')?.addEventListener('input', (event) => {
    state.textScale = Number((event.target as HTMLInputElement).value) / 100;
    scheduleRender();
  });

  document.querySelector<HTMLButtonElement>('#editButton')?.addEventListener('click', () => setEditing(!state.isEditing));
  document.querySelector<HTMLButtonElement>('#undoButton')?.addEventListener('click', () => applyHistory('undo'));
  document.querySelector<HTMLButtonElement>('#redoButton')?.addEventListener('click', () => applyHistory('redo'));
  document.querySelector<HTMLButtonElement>('#resetButton')?.addEventListener('click', () => {
    if (!resumeStore.isDirty || !window.confirm('Reset all résumé versions to the repository defaults? You can undo this change.')) return;
    if (resumeStore.reset()) {
      state.currentVersionId = 'template:product';
      clearTextCache();
      render();
    }
  });

  const resume = document.querySelector<HTMLElement>('#resume');
  resume?.addEventListener('click', (event) => {
    if (!state.isEditing) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-edit-path]');
    if (!target || !resume.contains(target)) return;
    if (activeEdit?.target === target) return;
    event.preventDefault();
    event.stopPropagation();
    if (activeEdit) finishInlineEdit(false);
    beginInlineEdit(target, { x: event.clientX, y: event.clientY });
  });
  resume?.addEventListener('beforeinput', (event) => {
    if (!activeEdit || event.target !== activeEdit.target) return;
    const inputEvent = event as InputEvent;
    if (activeEdit.kind === 'single' && (inputEvent.inputType === 'insertParagraph' || inputEvent.inputType === 'insertLineBreak')) {
      event.preventDefault();
      finishInlineEdit();
    }
  });
  resume?.addEventListener('input', (event) => {
    if (!activeEdit || event.target !== activeEdit.target) return;
    if (activeEdit.kind === 'single' && activeEdit.target.innerText.includes('\n')) {
      activeEdit.target.textContent = editableText(activeEdit.target, 'single');
      placeCaretAtEnd(activeEdit.target);
    }
    commitInlineValue(activeEdit);
    syncEditorUi();
    validateLayout();
  });
  resume?.addEventListener(
    'blur',
    (event) => {
      if (!activeEdit || event.target !== activeEdit.target) return;
      finishInlineEdit(false);
      window.setTimeout(() => {
        if (!activeEdit) render();
      }, 0);
    },
    true
  );
  resume?.addEventListener('keydown', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-edit-path]');
    if (!target || !resume.contains(target)) return;
    if (activeEdit?.target === target) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finishInlineEdit(true, true);
      } else if (activeEdit.kind === 'single' && event.key === 'Enter') {
        event.preventDefault();
        finishInlineEdit();
      } else if (activeEdit.kind === 'multiline' && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        finishInlineEdit();
      }
      return;
    }
    if (!state.isEditing || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    beginInlineEdit(target);
  });

  document.addEventListener('keydown', (event) => {
    if (!state.isEditing || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    const focused = document.activeElement;
    if (focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement || (focused instanceof HTMLElement && focused.isContentEditable)) return;
    event.preventDefault();
    applyHistory(event.shiftKey ? 'redo' : 'undo');
  });

  document.querySelector<HTMLButtonElement>('#printButton')?.addEventListener('click', () => {
    if (activeEdit) finishInlineEdit(false);
    render();
    requestAnimationFrame(() => window.print());
  });
  window.addEventListener('resize', () => {
    updatePreviewScale();
    scheduleRender();
  });
}

function observeFontLoading(): void {
  if (!('fonts' in document)) return;

  document.fonts.ready.then(() => {
    clearTextCache();
    scheduleRender();
  });
  document.fonts.addEventListener('loadingdone', () => {
    clearTextCache();
    scheduleRender();
  });
}

function init(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;

  app.innerHTML = Shell({ state, document: resumeStore.document });
  attachEvents();
  connectPrivateStore(resumeStore);
  observeFontLoading();
  render();
}

init();
