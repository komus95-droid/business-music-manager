import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HHMM } from '@shared';
import { isHHMM, hhmm } from '@shared';

export interface TimeEdit {
  kind: 'playlist' | 'announcement';
  id: string;
  value: HHMM;
  x: number;
  y: number;
}

interface Props {
  edit: TimeEdit;
  onApply(value: HHMM): void;
  onClose(): void;
}

/**
 * Всплывашка точного времени старта блока (перенос .time-pop из прототипа).
 * Рисуется порталом в body с fixed-позиционированием у точки клика, чтобы её
 * не клипала дорожка (overflow:hidden). Закрывается по клику вне.
 */
export function TimePopover({ edit, onApply, onClose }: Props) {
  const [value, setValue] = useState<string>(edit.value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // отложенная подписка, чтобы текущий клик-открытие не закрыл сразу
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  function apply() {
    if (isHHMM(value)) onApply(hhmm(value));
    onClose();
  }

  const left = Math.min(edit.x, window.innerWidth - 230);
  const top = Math.min(edit.y + 8, window.innerHeight - 110);

  return createPortal(
    <div ref={ref} className="time-pop" style={{ left, top }} role="dialog" aria-label="Точное время старта">
      <div className="tp-title">⏱ СТАРТ ВОСПРОИЗВЕДЕНИЯ</div>
      <div className="tp-row">
        <input
          type="time" value={value} autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
        />
        <button type="button" className="tp-ok" onClick={apply}>ОК</button>
      </div>
    </div>,
    document.body,
  );
}
