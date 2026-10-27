import type { EditMeta } from '../types';
import { escapeHtml } from '../utils/html';

export function editAttributes(meta?: EditMeta): string {
  if (!meta) return '';
  return [
    `data-edit-path="${escapeHtml(meta.path)}"`,
    `data-edit-label="${escapeHtml(meta.label)}"`,
    `data-edit-kind="${meta.kind}"`,
    `data-edit-scope="${meta.scope}"`,
    meta.segment ? `data-edit-segment="${meta.segment}"` : '',
    `aria-label="Edit ${escapeHtml(meta.label)}"`
  ]
    .filter(Boolean)
    .join(' ');
}
