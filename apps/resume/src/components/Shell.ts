import type { ApplicationVersion, AppState, ResumeDocument, VersionId } from '../types';
import { escapeHtml } from '../utils/html';
import './Shell.css';

type ShellProps = {
  state: AppState;
  document: ResumeDocument;
};

export function versionLabel(version: ApplicationVersion): string {
  const label = version.company ? `${version.company} - ${version.position}` : version.position;
  return version.archived ? `${label} (Archived)` : label;
}

function optionsFor(document: ResumeDocument, selectedId: VersionId): string {
  const groups: Array<{ label: string; versions: ApplicationVersion[] }> = [
    {
      label: 'Applications',
      versions: document.versionOrder
        .map((id) => document.versions[id])
        .filter((version): version is ApplicationVersion => Boolean(version && version.kind === 'application' && !version.archived))
    },
    {
      label: 'Templates',
      versions: document.versionOrder
        .map((id) => document.versions[id])
        .filter((version): version is ApplicationVersion => Boolean(version && version.kind === 'template'))
    },
    {
      label: 'Archived',
      versions: document.versionOrder
        .map((id) => document.versions[id])
        .filter((version): version is ApplicationVersion => Boolean(version && version.kind === 'application' && version.archived))
    }
  ];

  return groups
    .filter((group) => group.versions.length > 0)
    .map(
      (group) => `<optgroup label="${group.label}">${group.versions
        .map(
          (version) =>
            `<option value="${escapeHtml(version.id)}"${version.id === selectedId ? ' selected' : ''}>${escapeHtml(versionLabel(version))}</option>`
        )
        .join('')}</optgroup>`
    )
    .join('');
}

function sourceOptions(document: ResumeDocument, selectedId: VersionId): string {
  const current = document.versions[selectedId];
  const templates = document.versionOrder
    .map((id) => document.versions[id])
    .filter((version): version is ApplicationVersion => Boolean(version && version.kind === 'template'));
  return [
    current ? `<option value="${escapeHtml(current.id)}">Current: ${escapeHtml(versionLabel(current))}</option>` : '',
    ...templates
      .filter((template) => template.id !== current?.id)
      .map((template) => `<option value="${escapeHtml(template.id)}">Template: ${escapeHtml(versionLabel(template))}</option>`)
  ].join('');
}

export function Shell({ state, document }: ShellProps): string {
  return `
    <header class="app-bar">
      <div class="brand-logo" aria-label="Frank Resume">
        <img class="brand-signature" src="/frank-signature.svg" alt="" aria-hidden="true">
        <span class="brand-title">Résumé</span>
      </div>
      <div class="controls">
        <div class="version-cluster">
          <label class="role-control">
            <span class="sr-only">Application version</span>
            <select id="versionSelect" aria-label="Application version">${optionsFor(document, state.currentVersionId)}</select>
          </label>
          <button id="newVersionButton" type="button" class="compact-button">New</button>
          <button id="manageVersionButton" type="button" class="compact-button" aria-expanded="false">Manage</button>
        </div>
        <div class="mode-control" role="group" aria-label="Resume format">
          <button type="button" data-mode="visual" class="${state.currentMode === 'visual' ? 'active' : ''}">Visual</button>
          <button type="button" data-mode="ats" class="${state.currentMode === 'ats' ? 'active' : ''}">ATS</button>
        </div>
        <label class="checkbox-control">
          <input id="coverLetterToggle" type="checkbox"${state.includeCoverLetter ? ' checked' : ''}>
          <span>Letter</span>
        </label>
        <label class="slider-control">
          <span class="scale-mark" aria-hidden="true">A</span>
          <span class="sr-only">Text size</span>
          <input id="textScaleSlider" type="range" min="90" max="110" step="5" list="textScaleStops" value="${Math.round(state.textScale * 100)}">
          <datalist id="textScaleStops">
            <option value="90" label="90%"></option><option value="95" label="95%"></option>
            <option value="100" label="100%"></option><option value="105" label="105%"></option><option value="110" label="110%"></option>
          </datalist>
          <output id="textScaleValue">${Math.round(state.textScale * 100)}%</output>
        </label>
        <button id="editButton" type="button" class="edit-button" aria-pressed="${state.isEditing}" title="Edit résumé">${state.isEditing ? 'Done' : 'Edit'}</button>
        <button id="publicDraftButton" type="button" class="compact-button">Public draft</button>
        <button id="recoverBrowserButton" type="button" class="compact-button" hidden>Recover browser backup</button>
        <button id="printButton" type="button" class="icon-button" title="Print">
          <i class="fa-solid fa-print" aria-hidden="true"></i><span class="sr-only">Print</span>
        </button>
      </div>
    </header>
    <output id="privateStatus" class="private-status" role="status"></output>
    <dialog id="publicDraftDialog" class="public-draft-dialog">
      <h2>Review public résumé</h2>
      <p>Only this selected résumé is included. Other versions and cover letters stay private.</p>
      <img id="publicDraftImage" alt="First page of the selected résumé">
      <p><a id="publicDraftPdf" target="_blank" rel="noopener">Open complete PDF</a></p>
      <button id="closeDraftButton" type="button">Keep private draft</button>
      <button id="promoteDraftButton" type="button">Update website PDF and preview</button>
    </dialog>
    <main id="resume" class="resume-stage"></main>
    <div id="measure-root" aria-hidden="true"></div>
    <div id="editorToolbar" class="editor-toolbar" role="toolbar" aria-label="Editing controls" hidden>
      <span class="editor-guide">Click text to type</span>
      <output id="editorStatus" class="editor-status" aria-live="polite">Default copy</output>
      <button id="undoButton" type="button" class="editor-button" disabled>Undo</button>
      <button id="redoButton" type="button" class="editor-button" disabled>Redo</button>
      <button id="resetButton" type="button" class="editor-button editor-reset" disabled>Reset</button>
    </div>

    <div id="versionMenu" class="version-menu" hidden>
      <div id="versionMenuTitle" class="version-menu-title"></div>
      <button id="duplicateVersionButton" type="button">Duplicate</button>
      <button id="renameVersionButton" type="button">Rename</button>
      <button id="archiveVersionButton" type="button">Archive</button>
      <button id="deleteVersionButton" type="button" class="danger-action">Delete</button>
      <div class="version-menu-rule"></div>
      <button id="exportVersionsButton" type="button">Export all</button>
      <button id="importVersionsButton" type="button">Import backup</button>
    </div>

    <dialog id="versionDialog" class="version-dialog" aria-labelledby="versionDialogTitle">
      <form id="versionForm">
        <div class="version-dialog-heading">
          <h2 id="versionDialogTitle">New version</h2>
          <p id="versionDialogDescription">Create a résumé for one company and position.</p>
        </div>
        <label class="version-field">
          <span>Company</span>
          <input id="versionCompany" name="company" autocomplete="organization" required>
        </label>
        <label class="version-field">
          <span>Position</span>
          <input id="versionPosition" name="position" autocomplete="organization-title" required>
        </label>
        <label id="versionSourceField" class="version-field">
          <span>Start from</span>
          <select id="versionSource" name="source">${sourceOptions(document, state.currentVersionId)}</select>
        </label>
        <output id="versionFormError" class="version-form-error" aria-live="polite"></output>
        <div class="version-dialog-actions">
          <button id="cancelVersionButton" type="button" class="dialog-button secondary">Cancel</button>
          <button id="saveVersionButton" type="submit" class="dialog-button primary">Create version</button>
        </div>
      </form>
    </dialog>
    <input id="versionImportInput" type="file" accept="application/json,.json" hidden>
    <output id="versionNotice" class="version-notice" role="status" hidden></output>
    <output id="layoutWarning" class="layout-warning" role="status" hidden></output>
  `;
}

export function syncShellControls(state: AppState, document: ResumeDocument): void {
  const select = documentQuery<HTMLSelectElement>('#versionSelect');
  if (select) {
    select.innerHTML = optionsFor(document, state.currentVersionId);
    select.value = state.currentVersionId;
  }
  const source = documentQuery<HTMLSelectElement>('#versionSource');
  if (source) source.innerHTML = sourceOptions(document, state.currentVersionId);

  const coverToggle = documentQuery<HTMLInputElement>('#coverLetterToggle');
  if (coverToggle) coverToggle.checked = state.includeCoverLetter;
  const textSlider = documentQuery<HTMLInputElement>('#textScaleSlider');
  if (textSlider) textSlider.value = String(Math.round(state.textScale * 100));
  const textValue = documentQuery<HTMLOutputElement>('#textScaleValue');
  if (textValue) textValue.textContent = `${Math.round(state.textScale * 100)}%`;

  const editButton = documentQuery<HTMLButtonElement>('#editButton');
  if (editButton) {
    editButton.textContent = state.isEditing ? 'Done' : 'Edit';
    editButton.setAttribute('aria-pressed', String(state.isEditing));
    editButton.classList.toggle('active', state.isEditing);
  }

  const version = document.versions[state.currentVersionId];
  const templateSelected = version?.kind === 'template';
  const menuTitle = documentQuery<HTMLElement>('#versionMenuTitle');
  if (menuTitle) menuTitle.textContent = version ? versionLabel(version) : '';
  const rename = documentQuery<HTMLButtonElement>('#renameVersionButton');
  const archive = documentQuery<HTMLButtonElement>('#archiveVersionButton');
  const remove = documentQuery<HTMLButtonElement>('#deleteVersionButton');
  if (rename) rename.disabled = templateSelected;
  if (archive) {
    archive.disabled = templateSelected;
    archive.textContent = version?.archived ? 'Restore' : 'Archive';
  }
  if (remove) remove.disabled = templateSelected;

  globalThis.document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === state.currentMode);
  });
}

function documentQuery<T extends Element>(selector: string): T | null {
  return globalThis.document.querySelector<T>(selector);
}
