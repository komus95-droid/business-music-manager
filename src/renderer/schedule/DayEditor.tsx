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
}

export function DayEditor({ day, store, api, snap, canEdit }: Props) {
  function onHour(field: 'start' | 'end') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (isHHMM(v)) api.setHours({ kind: 'day', id: day.id }, { [field]: hhmm(v) });
    };
  }

  return (
    <section className="editor" aria-label={`Расписание: ${day.name}`}>
      <div className="editor-head">
        <span className="editor-title">{day.name}</span>
        <label className="hour">с
          <input type="time" value={day.start} disabled={day.off || !canEdit} onChange={onHour('start')} />
        </label>
        <label className="hour">до
          <input type="time" value={day.end} disabled={day.off || !canEdit} onChange={onHour('end')} />
        </label>
        <label className="offbox">
          <input
            type="checkbox" checked={day.off} disabled={!canEdit}
            onChange={(e) => api.setHours({ kind: 'day', id: day.id }, { off: e.target.checked })}
          />
          Выходной
        </label>
      </div>

      {day.off ? (
        <div className="closed">Заведение закрыто — вещания в этот день нет</div>
      ) : (
        <ScheduleBody
          win={day} location={{ kind: 'day', id: day.id }}
          store={store} api={api} snap={snap} canEdit={canEdit}
        />
      )}
    </section>
  );
}
