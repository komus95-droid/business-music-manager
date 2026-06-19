import type { CSSProperties } from 'react';
import type { AppMode, AudioSettings, EqBands, EqPresetName } from '@shared';
import {
  EQ_BAND_LABELS, EQ_PRESETS, EQ_PRESET_LABELS, FADE_OVERLAP_MAX,
} from '@shared';

/**
 * Нижняя панель настроек звука — соответствует `.controls` прототипа.
 * Авто-дакинг, кроссфейд/нахлёст, сглаживание, мастер-громкость и
 * 10-полосный эквалайзер с пресетами и кривой. Любое изменение пишется в
 * store.audio и применяется движком на лету (AudioProvider → applyAudioSettings).
 */
const PRESET_ORDER: EqPresetName[] = [
  'flat', 'pop', 'rock', 'jazz', 'classical', 'dance', 'bass', 'vocal', 'speech',
];

interface Props {
  mode: AppMode;
  audio: AudioSettings;
  onVolume(v: number): void;
  onPatch(patch: Partial<AudioSettings>): void;
}

export function ControlsPanel({ mode, audio, onVolume, onPatch }: Props) {
  const onAir = mode === 'onair';

  function setBand(i: number, v: number) {
    const next = audio.eq.map((b, idx) => (idx === i ? v : b)) as unknown as EqBands;
    onPatch({ eq: next, eqPreset: null });
  }
  function setPreset(name: EqPresetName) {
    onPatch({ eq: EQ_PRESETS[name], eqPreset: name });
  }

  // кривая EQ (как в прототипе): полилиния по значениям полос
  const n = audio.eq.length;
  const pts = audio.eq.map((v, i) => `${((i / (n - 1)) * 100).toFixed(1)},${(100 - v).toFixed(1)}`).join(' ');

  // заливка слайдера громкости (как oninput в прототипе)
  const volStyle: CSSProperties = {
    background: `linear-gradient(90deg,var(--accent) 0 ${audio.volume}%,var(--line-2) ${audio.volume}%)`,
  };

  return (
    <div className={`controls${onAir ? ' onair' : ''}`} aria-label="Настройки звука">
      <div className="ctl">
        <div className="lbl">AUTO-DUCKING <span className="i">i</span></div>
        <input
          type="range" className="slider" min={0} max={100} step={1} value={audio.ducking}
          aria-label="Авто-дакинг"
          onChange={(e) => onPatch({ ducking: Number(e.target.value) })}
        />
        <div className="val">{audio.ducking}%</div>
      </div>

      <div className="ctl">
        <div className="lbl">FADE OVERLAP</div>
        <input
          type="range" className="slider" min={0} max={FADE_OVERLAP_MAX} step={1} value={audio.fadeOverlap}
          aria-label="Кроссфейд / нахлёст"
          onChange={(e) => onPatch({ fadeOverlap: Number(e.target.value) })}
        />
        <div className="val">{audio.fadeOverlap}с</div>
      </div>

      <div className="ctl">
        <div className="lbl">SMOOTHING</div>
        <input
          type="range" className="slider" min={0} max={100} step={1} value={audio.smoothing}
          aria-label="Сглаживание"
          onChange={(e) => onPatch({ smoothing: Number(e.target.value) })}
        />
        <div className="val">{audio.smoothing}%</div>
      </div>

      <div className="ctl vol">
        <div className="lbl">🔊 ГРОМКОСТЬ</div>
        <input
          type="range" className="slider vol" min={0} max={100} step={1} value={audio.volume}
          style={volStyle} aria-label="Громкость вещания"
          onChange={(e) => onVolume(Number(e.target.value))}
        />
        <div className="val">{audio.volume}%</div>
      </div>

      <div className="eq-wrap">
        <div className="eq-presets">
          <span className="eq-lbl">EQ 10</span>
          {PRESET_ORDER.map((name) => (
            <button
              key={name} type="button"
              className={audio.eqPreset === name ? 'active' : ''}
              onClick={() => setPreset(name)}
            >{EQ_PRESET_LABELS[name]}</button>
          ))}
        </div>
        <div className="eq-area">
          <svg className="eq-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={`0,100 ${pts} 100,100`} fill="var(--accent-soft)" stroke="none" />
            <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="eq">
            {EQ_BAND_LABELS.map((label, i) => (
              <div className="bar" key={label}>
                <input
                  type="range" min={0} max={100} step={1} value={audio.eq[i]}
                  aria-label={`EQ ${label}`}
                  onChange={(e) => setBand(i, Number(e.target.value))}
                />
                <span className="bn">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
