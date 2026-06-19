import { useState } from 'react';
import type { ThemeMode } from '@shared';
import { flash } from '../ui/flash';

interface Props {
  open: boolean;
  onClose(): void;
  theme: ThemeMode;
  onToggleTheme(): void;
  volume: number;
  onVolume(v: number): void;
}

/**
 * Окно настроек по прототипу (иконка ⚙ в шапке). Рабочие пункты — тема и
 * громкость вещания (привязаны к store/теме приложения). Остальные пункты
 * (язык, папка медиа, автозапуск, обновления, перезапуск) — визуальные
 * заглушки до отдельной задачи с системным IPC; на действие показываем тост.
 */
export function SettingsModal({ open, onClose, theme, onToggleTheme, volume, onVolume }: Props) {
  const [autostart, setAutostart] = useState(true);
  const soon = () => flash('Функция появится в следующем обновлении');

  return (
    <div
      className={`modal-bg${open ? ' open' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" style={{ position: 'relative' }} role="dialog" aria-label="Настройки" aria-modal="true">
        <div className="m-head">
          <h3>⚙ Настройки</h3>
          <button type="button" className="m-x" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className="m-row">
          <div><div className="m-l">Громкость вещания</div><div className="m-sub">Общий уровень выхода</div></div>
          <div className="m-ctl">
            <input
              type="range" className="slider m-vol" min={0} max={100} value={volume}
              aria-label="Громкость вещания" onChange={(e) => onVolume(Number(e.target.value))}
            />
            <span style={{ fontWeight: 700, minWidth: 38 }}>{volume}%</span>
          </div>
        </div>

        <div className="m-row">
          <div><div className="m-l">Тема оформления</div><div className="m-sub">При запуске всегда тёмная</div></div>
          <div className="m-ctl">
            <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>День</span>
            <span
              className={`sw${theme === 'dark' ? ' on' : ''}`} role="switch" aria-checked={theme === 'dark'}
              tabIndex={0} onClick={onToggleTheme}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleTheme(); } }}
            />
            <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>Ночь</span>
          </div>
        </div>

        <div className="m-row">
          <div><div className="m-l">Язык интерфейса</div></div>
          <div className="m-ctl">
            <select className="m-select" defaultValue="ru" onChange={soon} aria-label="Язык интерфейса">
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div className="m-row">
          <div><div className="m-l">Папка с медиафайлами</div><div className="m-sub">AppData/bmm-data/media</div></div>
          <div className="m-ctl"><button type="button" className="m-btn" onClick={soon}>Изменить…</button></div>
        </div>

        <div className="m-row">
          <div><div className="m-l">Автозапуск с Windows</div><div className="m-sub">Старт вещания при входе в систему</div></div>
          <div className="m-ctl">
            <span
              className={`sw${autostart ? ' on' : ''}`} role="switch" aria-checked={autostart}
              tabIndex={0} onClick={() => setAutostart((v) => !v)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAutostart((v) => !v); } }}
            />
          </div>
        </div>

        <div className="m-row">
          <div><div className="m-l">Обновления</div><div className="m-sub">Версия 1.2.0 · актуальная</div></div>
          <div className="m-ctl"><button type="button" className="m-btn" onClick={soon}>Проверить</button></div>
        </div>

        <div className="m-row">
          <div><div className="m-l">Перезапустить вещание</div><div className="m-sub">Пересинхронизировать с расписанием</div></div>
          <div className="m-ctl"><button type="button" className="m-btn" onClick={soon}>Перезапустить</button></div>
        </div>

        <div className="m-note">
          ⏸ Эфир нельзя поставить на паузу. После остановки вещание продолжается строго
          по текущей дате и времени — не с момента остановки.
        </div>
      </div>
    </div>
  );
}
