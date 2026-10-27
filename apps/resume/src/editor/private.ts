import type { ResumeDocument } from '../types';
import type { ResumeStore } from './store';

const token = document.querySelector<HTMLMetaElement>('meta[name="resume-session"]')?.content;
const exporting = new URLSearchParams(location.search).has('export');
let revision = '';
let blocked = false;
let pending: string | null = null;
let saving: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout>;
const cacheKey = 'frank-resume-document-v2';
const recoveryKey = 'website-resume-recovery';

function status(message: string, error = false): void {
  const node = document.querySelector<HTMLOutputElement>('#privateStatus');
  if (node) { node.textContent = message; node.dataset.error = String(error); }
}

export async function loadPrivateDocument(fallback: ResumeDocument): Promise<ResumeDocument> {
  if (!token) return fallback;
  const response = await fetch('/__local/resume', { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not read the private résumé file');
  revision = data.revision;
  if (!exporting) {
    const previous = localStorage.getItem(cacheKey);
    if (previous && JSON.stringify({ profile: JSON.parse(previous).profile, versions: JSON.parse(previous).versions }) !== JSON.stringify({ profile: data.document.profile, versions: data.document.versions })) localStorage.setItem(recoveryKey, previous);
    localStorage.setItem(cacheKey, JSON.stringify(data.document));
  }
  return data.document;
}

async function request(endpoint: string, body: unknown, method = 'POST') {
  const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json', 'X-Resume-Session': token || '' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) { if (response.status === 409) blocked = true; throw new Error(result.error || 'Could not save'); }
  return result;
}

async function flush(): Promise<void> {
  if (saving) { await saving; return flush(); }
  if (!pending || blocked) { if (blocked) throw new Error('File changed elsewhere. Export your local copy or reload.'); return; }
  const copy = pending;
  pending = null;
  saving = (async () => {
    status('Saving…');
    try {
      const result = await request('/__local/resume', { document: JSON.parse(copy), revision }, 'PUT');
      revision = result.revision;
      status('Saved to Knowledge');
    } catch (error) { pending ??= copy; status((error as Error).message, true); throw error; }
  })();
  try { await saving; } finally { saving = null; }
  if (pending) return flush();
}

export function connectPrivateStore(store: ResumeStore): void {
  if (exporting) return;
  if (!token) { status('Demo · saved in this browser'); return; }
  status('Saved to Knowledge');
  store.subscribe(() => {
    pending = store.exportJson();
    status('Unsaved changes');
    clearTimeout(timer);
    timer = setTimeout(() => void flush().catch(() => {}), 600);
  });
  window.addEventListener('beforeunload', (event) => { if (pending || saving) { event.preventDefault(); event.returnValue = ''; } });
  const recovery = document.querySelector<HTMLButtonElement>('#recoverBrowserButton');
  if (recovery) {
    recovery.hidden = !localStorage.getItem(recoveryKey);
    recovery.onclick = async () => {
      if (confirm('Restore the retained browser backup into your private résumé file?')) {
        const raw = localStorage.getItem(recoveryKey);
        if (raw && store.importJson(raw)) {
          try { await flush(); location.reload(); } catch (error) { status((error as Error).message, true); }
        }
      }
    };
  }
  const generate = document.querySelector<HTMLButtonElement>('#publicDraftButton');
  if (generate) generate.onclick = async () => {
    generate.disabled = true;
    try {
      await flush();
      status('Generating PDF and preview…');
      const selected = document.querySelector<HTMLSelectElement>('#versionSelect')!.value;
      const mode = document.querySelector<HTMLButtonElement>('[data-mode].active')?.dataset.mode || 'visual';
      const scale = Number(document.querySelector<HTMLInputElement>('#textScaleSlider')!.value) / 100;
      const result = await request('/__local/resume/export', { versionId: selected, mode, textScale: scale, revision });
      const dialog = document.querySelector<HTMLDialogElement>('#publicDraftDialog')!;
      document.querySelector<HTMLImageElement>('#publicDraftImage')!.src = result.preview;
      document.querySelector<HTMLAnchorElement>('#publicDraftPdf')!.href = result.pdf;
      document.querySelector<HTMLButtonElement>('#promoteDraftButton')!.onclick = async () => {
        try { await request('/__local/resume/promote', { id: result.id }); dialog.close(); status('Website PDF and preview updated · publish with your next website commit'); }
        catch (error) { status((error as Error).message, true); }
      };
      document.querySelector<HTMLButtonElement>('#closeDraftButton')!.onclick = () => dialog.close();
      dialog.showModal();
      status('Draft ready · review before updating the website');
    } catch (error) { status((error as Error).message, true); }
    finally { generate.disabled = false; }
  };
}
