import type { ChangeEvent } from 'react';
import type { WeekDay, PersistedStore } from '@shared';
import { isHHMM, hhmm } from '@shared';
import type { StoreApi } from '../state/useStore';
import { ScheduleBody } from './ScheduleBody';

interface Props {
  day: WeekDay;
  store: PersistedStore;
  api: StoreApi;
  snap: number;
  canEdit: boolean;
  onSnap(snap: number): void;
  onClear(): void;
}

const SNAP_OPTIONS = [1, 5, 15];

export function DayEditor({ day, store, api, snap, canEdit, onSnap, onClear }: Props) {
  function onHour(field: 'start' | 'end') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (isHHMM(v)) api.setHours({ kind: 'day', id: day.id }, { [field]: hhmm(v) });
    };
  }

  const hasBlocks = day.blocks.length > 0;

  return (
    <section className="editor" aria-label={`Расписание: ${day.name}`}>
      <div className="stage-head">
        <h2>{day.name}</h2>
        <span className={`badge ${day.off ? 'off' : 'work'}`}>{day.off ? 'ВЫХОДНОЙ' : 'РАБОЧИЙ ДЕНЬ'}</span>

        <div className="hours-edit">
          <label className="hour">с
            <input type="time" value={day.start} disabled={day.off || !canEdit} onChange={onHour('start')} />
          </label>
          <span>–</span>
          <label className="hour">до
            <input type="time" value={day.end} disabled={day.off || !canEdit} onChange={onHour('end')} />
          </label>
        </div>

        <div className="spacer" />

        <label className="tool-sel">шаг
          <select value={snap} disabled={!canEdit} onChange={(e) => onSnap(Number(e.target.value))}>
            {SNAP_OPTIONS.map((m) => <option key={m} value={m}>{m} мин</option>)}
          </select>
        </label>
        <button
          type="button" className="hl-btn" disabled={!canEdit || day.off || !hasBlocks}
          title="Очистить расписание дня" onClick={onClear}
        >Очистить</button>

        <label className="offbox">
          <input
            type="checkbox" checked={day.off} disabled={!canEdit}
            onChange={(e) => api.setHours({ kind: 'day', id: day.id }, { off: e.target.checked })}
          />
          Выходной
        </label>
      </div>

      {day.off ? (
        <div className="closed">🌙 Заведение закрыто — вещания в этот день нет</div>
      ) : (
        <ScheduleBody
          win={day} location={{ kind: 'day', id: day.id }}
          store={store} api={api} snap={snap} canEdit={canEdit}
        />
      )}
    </section>
  );
}
