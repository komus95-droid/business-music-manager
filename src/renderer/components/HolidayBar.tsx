import type { Holiday, Id } from '@shared';

interface Props {
  holidays: Holiday[];
  currentId: Id | null;
  conflictIds: Set<Id>;
  canAdd: boolean;
  onSelect(id: Id): void;
  onAdd(): void;
}

function counts(h: Holiday): { pl: number; an: number } {
  let pl = 0; let an = 0;
  for (const b of h.blocks) (b.kind === 'playlist' ? pl++ : an++);
  return { pl, an };
}

function dateLabel(h: Holiday): string {
  const base = h.to ? `${h.from} – ${h.to}` : h.from;
  return h.year ? `${base} · ${h.year}` : base;
}

/**
 * Горизонтальная лента праздников над сценой (разметка прототипа:
 * .holiday-bar / .hb-title / .holiday-scroll / .hol / .hol.add). Клик
 * открывает редактор праздника. Значок ⚠ — мягкое предупреждение о
 * пересечении дат с другим праздником.
 */
export function HolidayBar({ holidays, currentId, conflictIds, canAdd, onSelect, onAdd }: Props) {
  return (
    <div className="holiday-bar" aria-label="Праздники">
      <span className="hb-title">ПРАЗДНИКИ</span>
      <div className="holiday-scroll">
        {holidays.map((h) => {
          const c = counts(h);
          const sel = h.id === currentId;
          const dotCls = h.off ? 'off' : (h.blocks.length ? 'ok' : 'empty');
          return (
            <button
              key={h.id} type="button"
              className={`hol${sel ? ' active' : ''}${h.off ? ' off' : ''}`}
              aria-current={sel ? 'true' : undefined}
              onClick={() => onSelect(h.id)}
              title={h.name}
            >
              <div className="hol-name">
                {h.name}
                {conflictIds.has(h.id) && <span className="warn-i" title="Пересечение дат"> ⚠</span>}
              </div>
              <div className="hol-date">{dateLabel(h)} · {h.off ? 'отключён' : `${h.start}–${h.end}`}</div>
              <div className="d-meta">
                <span className={`d-dot ${dotCls}`} />
                {h.off ? 'отключён' : `♪${c.pl} · 📢${c.an}`}
              </div>
            </button>
          );
        })}
        {holidays.length === 0 && (
          <span className="hol-empty" style={{ color: 'var(--txt-faint)', fontSize: 12, alignSelf: 'center' }}>
            Праздников нет — добавьте дату или период.
          </span>
        )}
        <button
          type="button" className="hol add" onClick={onAdd}
          disabled={!canAdd} title={canAdd ? 'Добавить праздник' : 'В эфире / достигнут лимит'}
        >+ дата / период</button>
      </div>
    </div>
  );
}
