import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import type { EditMeta, FontToken, TextBlock } from '../types';
import { editAttributes } from '../editor/markup';
import { escapeHtml } from './html';

const fontSpec: Record<FontToken, { size: number; line: number; weight: number }> = {
  display: { size: 34, line: 36, weight: 620 },
  title: { size: 15.5, line: 19.5, weight: 560 },
  section: { size: 9, line: 12, weight: 620 },
  label: { size: 7, line: 9, weight: 620 },
  body: { size: 9, line: 13, weight: 400 },
  small: { size: 8, line: 11.5, weight: 400 },
  tiny: { size: 7, line: 9.8, weight: 500 }
};

const preparedCache = new Map<string, ReturnType<typeof prepareWithSegments>>();
let textScale = 1;

export function setTextScale(nextScale: number): void {
  textScale = nextScale;
}

export function clearTextCache(): void {
  preparedCache.clear();
}

export function font(token: FontToken): string {
  const spec = fontSpec[token];
  return `${spec.weight} ${Math.round(spec.size * textScale * 100) / 100}px Inter, Arial, sans-serif`;
}

export function lineHeight(token: FontToken): number {
  return Math.round(fontSpec[token].line * textScale * 100) / 100;
}

function prepared(text: string, fontValue: string) {
  const key = `${fontValue}\u0000${text}`;
  const cached = preparedCache.get(key);
  if (cached) return cached;
  const next = prepareWithSegments(text, fontValue);
  preparedCache.set(key, next);
  return next;
}

export function renderText(text: string, width: number, token: FontToken, className = '', edit?: EditMeta): TextBlock {
  const fontValue = font(token);
  const line = lineHeight(token);
  const layout = layoutWithLines(prepared(text, fontValue), Math.max(24, width), line);
  const rows = layout.lines
    .map((row, index) => {
      const clean = row.text.replace(/[ \t]+$/u, '');
      return `<span class="text-row" style="top:${index * line}px;height:${line}px;font:${fontValue};line-height:${line}px">${escapeHtml(clean)}</span>`;
    })
    .join('');

  return {
    height: layout.height,
    html: `<span class="text-block ${className}" style="height:${layout.height}px" ${editAttributes(edit)}>${rows}</span>`
  };
}

export function renderList(
  items: string[],
  width: number,
  token: FontToken = 'small',
  edit?: { basePath: string; label: string; scope: EditMeta['scope'] }
): string {
  return items
    .map((item, index) => {
      const block = renderText(
        item,
        width - 12,
        token,
        '',
        edit
          ? {
              path: `${edit.basePath}.${index}`,
              label: `${edit.label} ${index + 1}`,
              kind: 'multiline',
              scope: edit.scope
            }
          : undefined
      );
      return `<li>${block.html}</li>`;
    })
    .join('');
}
