import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AudioSettings } from '@shared';
import { createAudioEngine } from './index';
import type { AudioEngine, PlaybackState } from './index';

/**
 * Единственный экземпляр аудио-движка (Чат 4) на всё приложение (Чат 8).
 * Провайдер создаёт движок один раз, перенакатывает AudioSettings при их
 * изменении и отдаёт наблюдаемое PlaybackState в React-стейт. Предпрослушка в
 * Студии (редакторы, шкала дня) и нижняя полоса плеера берут движок отсюда
 * через useAudio() — так у всех один и тот же звук и одно состояние.
 *
 * В эфире (Чат 9) этот же движок будет вести планировщик; пока в эфире
 * предпрослушка просто выключена в потребителях.
 */

export interface AudioContextValue {
  engine: AudioEngine;
  playback: PlaybackState;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

interface Props {
  /** актуальные настройки звука из store.audio */
  audio: AudioSettings;
  children: ReactNode;
}

export function AudioProvider({ audio, children }: Props) {
  // Ленивая инициализация: движок живёт всё время работы приложения.
  const engineRef = useRef<AudioEngine | null>(null);
  if (engineRef.current === null) engineRef.current = createAudioEngine(audio);
  const engine = engineRef.current;

  const [playback, setPlayback] = useState<PlaybackState>(() => engine.getState());

  // подписка на состояние движка (onState сразу отдаёт текущий снимок)
  useEffect(() => engine.onState(setPlayback), [engine]);

  // освобождение ресурсов при закрытии приложения
  useEffect(() => () => engine.destroy(), [engine]);

  // настройки звука меняются → мастер-громкость/EQ/дакинг применяются на лету
  useEffect(() => { engine.applyAudioSettings(audio); }, [engine, audio]);

  return <AudioCtx.Provider value={{ engine, playback }}>{children}</AudioCtx.Provider>;
}

export function useAudio(): AudioContextValue {
  const v = useContext(AudioCtx);
  if (!v) throw new Error('useAudio() вызван вне <AudioProvider>');
  return v;
}
