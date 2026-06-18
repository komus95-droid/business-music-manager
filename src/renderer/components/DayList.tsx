import type { DayId, WeekDay } from '@shared';
import { DAY_ORDER } from '@shared';

interface Props {
  week: Record<DayId, WeekDay>;
  currentDayId: DayId | null;
  onSelect(id: DayId): void;
}

/** Левая колонка: 7 дней недели с часами работы; выбор активного дня. */
export function DayList({ week, currentDayId, onSelect }: Props) {
  return (
    <nav className="daylist" aria-label="Дни недели">
      {DAY_ORDER.map((id) => {
        const d = week[id];
        const active = id === currentDayId;
        return (
          <button
            key={id}
            type="button"
            className={`day${active ? ' sel' : ''}${d.off ? ' off' : ''}`}
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(id)}
          >
            <span className="day-name">{d.short}</span>
            <span className="day-time">{d.off ? 'Выходной' : `${d.start}–${d.end}`}</span>
          </button>
        );
      })}
    </nav>
  );
}
