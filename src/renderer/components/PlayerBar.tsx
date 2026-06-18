/**
 * Нижняя полоса плеера — заглушка. Реальный движок (Чат 4) подключается в
 * Студии (Чат 8): кнопки/прогресс/время/громкость будут жить от PlaybackState.
 */
export function PlayerBar() {
  return (
    <footer className="player" aria-label="Плеер">
      <div className="player-ctrls" aria-hidden="true">
        <span className="pbtn">►</span>
        <span className="pbtn">❚❚</span>
        <span className="pbtn">■</span>
      </div>
      <div className="player-track">
        <div className="player-bar"><span style={{ width: '0%' }} /></div>
      </div>
      <span className="player-hint">плеер подключается в Студии (Чат 8)</span>
    </footer>
  );
}
