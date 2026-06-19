import type { ChangeEvent } from 'react';
import type { Holiday, PersistedStore, DDMM } from '@shared';
import {
  isHHMM, hhmm, ddmm, isValidCalendarDDMM, holidaysConflictingWith, holidaysOverlap,
} from '@shared';
import type { StoreApi } from '../state/useStore';
import { ScheduleBody } from './ScheduleBody';
import { flash } from '../ui/flash';

/**
 * Редактор праздника (Чат 6). Шапка .stage-head — праздник-специфичная (имя,
 * даты/период, часы, шаг, очистка, «Отключён», удалить), а шкала ниже —
 * общий `ScheduleBody`, как у дня недели. Пересечение дат с другим праздником —
 * мягко: значок в ленте + тост + плашка.
 */
interface Props {
  holiday: Holiday;
  store: PersistedStore;
  api: StoreApi;
  snap: number;
  canEdit: boolean;
  onSnap(snap: number): void;
  onClear(): void;
  onDeleted(): void;
}

const SNAP_OPTIONS = [1, 5, 15];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parseDDMM(v: string): { d: number; m: number } {
  const [d, m] = v.split('.').map(Number);
  return { d: d || 1, m: m || 1 };
}

/** Собрать корректную дату DD.MM, зажав день под число дней месяца. */
function buildDDMM(d: number, m: number): DDMM | null {
  const mm = Math.min(Math.max(m, 1), 12);
  const dd = Math.min(Math.max(d, 1), DAYS_IN_MONTH[mm - 1]);
  const s = `${String(dd).padStart(2, '0')}.${String(mm).padStart(2, '0')}`;
  return isValidCalendarDDMM(s) ? ddmm(s) : null;
}

function dateLabel(h: Holiday): string {
  const base = h.to ? `${h.from} – ${h.to}` : h.from;
  return h.year ? `${base} · ${h.year}` : base;
}

export function HolidayEditor({ holiday: h, store, api, snap, canEdit, onSnap, onClear, onDeleted }: Props) {
  const conflicts = holidaysConflictingWith(store.holidays, h.id);

  /** Применить патч метаданных и мягко предупредить, если возник конфликт дат. */
  function commitMeta(patch: Partial<Pick<Holiday, 'name' | 'from' | 'to' | 'year'>>) {
    api.setHolidayMeta(h.id, patch);
    const next: Holiday = { ...h, ...patch };
    const clash = store.holidays.find((o) => o.id !== h.id && holidaysOverlap(next, o));
    if (clash) flash(`⚠ Пересечение дат с «${clash.name}»`);
  }

  function onHour(field: 'start' | 'end') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (isHHMM(v)) api.setHours({ kind: 'holiday', id: h.id }, { [field]: hhmm(v) });
    };
  }

  function onDate(field: 'from' | 'to', part: 'd' | 'm') {
    return (e: ChangeEvent<HTMLSelectElement>) => {
      const cur = parseDDMM((field === 'from' ? h.from : h.to) ?? h.from);
      const next = part === 'd'
        ? buildDDMM(Number(e.target.value), cur.m)
        : buildDDMM(cur.d, Number(e.target.value));
      if (next) commitMeta({ [field]: next });
    };
  }

  function togglePeriod() {
    commitMeta({ to: h.to ? null : h.from });
  }

  function del() {
    if (window.confirm(`Удалить праздник «${h.name}»? Действие необратимо.`)) {
      api.removeHoliday(h.id);
      onDeleted();
    }
  }

  const from = parseDDMM(h.from);
  const to = parseDDMM(h.to ?? h.from);
  const hasBlocks = h.blocks.length > 0;

  return (
    <section className="editor" aria-label={`Праздник: ${h.name}`}>
      <div className="stage-head">
        <input
          className="hol-title" value={h.name} disabled={!canEdit}
          aria-label="Название праздника"
          onChange={(e) => api.setHolidayMeta(h.id, { name: e.target.value })}
        />
        <span className={`badge ${h.off ? 'off' : 'hol'}`}>{h.off ? 'ОТКЛЮЧЁН' : 'ПРАЗДНИК'}</span>

        <div className="hours-edit">
          <label className="hour">с
            <input type="time" value={h.start} disabled={h.off || !canEdit} onChange={onHour('start')} />
          </label>
          <span>–</span>
          <label className="hour">до
            <input type="time" value={h.end} disabled={h.off || !canEdit} onChange={onHour('end')} />
          </label>
        </div>

        <div className="spacer" />

        <label className="tool-sel">шаг
          <select value={snap} disabled={!canEdit} onChange={(e) => onSnap(Number(e.target.value))}>
            {SNAP_OPTIONS.map((m) => <option key={m} value={m}>{m} мин</option>)}
          </select>
        </label>
        <button
          type="button" className="hl-btn" disabled={!canEdit || h.off || !hasBlocks}
          title="Очистить расписание праздника" onClick={onClear}
        >Очистить</button>

        <label className="offbox">
          <input
            type="checkbox" checked={h.off} disabled={!canEdit}
            onChange={(e) => api.setHours({ kind: 'holiday', id: h.id }, { off: e.target.checked })}
          />
          Отключён
        </label>
        <button type="button" className="hl-del" disabled={!canEdit} onClick={del}>Удалить</button>
      </div>

      <div className="hol-dates">
        <span>дата</span>
        <DateSelect d={from.d} m={from.m} disabled={!canEdit} onD={onDate('from', 'd')} onM={onDate('from', 'm')} />
        <button
          type="button" className={`period-tg${h.to ? ' on' : ''}`} disabled={!canEdit}
          onClick={togglePeriod}
        >{h.to ? '✓ период' : '+ период'}</button>
        {h.to && (
          <>
            <span>по</span>
            <DateSelect d={to.d} m={to.m} disabled={!canEdit} onD={onDate('to', 'd')} onM={onDate('to', 'm')} />
          </>
        )}
      </div>

      <p className="override-note">⚑ Праздник перекрывает день недели в эти даты ({dateLabel(h)}).</p>

      {conflicts.length > 0 && (
        <p className="hol-conflict" role="alert">
          ⚠ Даты пересекаются с: {conflicts.map((c) => `«${c.name}»`).join(', ')}.
          Приоритет между праздниками решается в режиме «В эфире».
        </p>
      )}

      {h.off ? (
        <div className="closed">🌙 В этот праздник заведение закрыто — вещания нет</div>
      ) : (
        <ScheduleBody
          win={h} location={{ kind: 'holiday', id: h.id }}
          store={store} api={api} snap={snap} canEdit={canEdit}
        />
      )}
    </section>
  );
}

function DateSelect({ d, m, disabled, onD, onM }: {
  d: number; m: number; disabled: boolean;
  onD(e: ChangeEvent<HTMLSelectElement>): void;
  onM(e: ChangeEvent<HTMLSelectElement>): void;
}) {
  return (
    <span className="date-pick">
      <select value={d} disabled={disabled} aria-label="День" onChange={onD}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{String(n).padStart(2, '0')}</option>
        ))}
      </select>
      <span className="sep">.</span>
      <select value={m} disabled={disabled} aria-label="Месяц" onChange={onM}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{String(n).padStart(2, '0')}</option>
        ))}
      </select>
    </span>
  );
}
