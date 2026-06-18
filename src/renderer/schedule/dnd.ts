import type { DragEvent } from 'react';
import type { Id, BlockKind } from '@shared';

/**
 * Полезная нагрузка drag&drop. Через text/plain (надёжнее кастомных MIME в
 * Electron). `add` — перетащили ассет из библиотеки; `move` — двигаем уже
 * стоящий блок внутри его дорожки.
 */
export type DragPayload =
  | { op: 'add'; kind: BlockKind; refId: Id }
  | { op: 'move'; kind: BlockKind; blockId: Id };

export function setDrag(e: DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
}

export function getDrag(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData('text/plain');
    const p = JSON.parse(raw) as DragPayload;
    if (p && (p.op === 'add' || p.op === 'move')) return p;
    return null;
  } catch {
    return null;
  }
}

/** Доля 0..1 точки клика по горизонтали внутри элемента дорожки. */
export function dropFrac(e: DragEvent, lane: HTMLElement): number {
  const r = lane.getBoundingClientRect();
  return r.width > 0 ? (e.clientX - r.left) / r.width : 0;
}
