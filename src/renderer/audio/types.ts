/**
 * Публичные типы аудио-движка (Чат 4): команды на воспроизведение и
 * наблюдаемое состояние для нижней полосы плеера. Движок принимает
 * УЖЕ резолвнутые `file://`-URL — он не знает про форму store
 * (адаптеры из доменных типов лежат в resolvers.ts).
 */

import type { Id } from '@shared';

/** Трек плейлиста с уже готовым URL источника. */
export interface PlaylistTrackSrc {
  id: Id;
  name: string;
  durationSec: number;
  /** готовый `file://`-URL (см. resolvers.trackUrl) */
  url: string;
}

/** Команда запуска плейлиста. */
export interface PlayPlaylistRequest {
  playlistId: Id;
  name: string;
  /** бесшовный переход между треками; сила = AudioSettings.fadeOverlap */
  crossfade: boolean;
  tracks: PlaylistTrackSrc[];
  /** с какого трека начать (по умолчанию 0) */
  startIndex?: number;
  /** смещение внутри стартового трека, сек (для входа в эфир «по середине») */
  startOffsetSec?: number;
  /** зациклить (для предпрослушивания в Студии); в эфире блок играет один проход */
  loop?: boolean;
}

/** Команда запуска объявления (приглушает музыку, по окончании — возврат). */
export interface PlayAnnouncementRequest {
  announcementId: Id;
  name: string;
  /** готовый `file://`-URL (см. resolvers.announcementUrl) */
  url: string;
  /** громкость объявления, 0..100 (Announcement.volume) */
  volume: number;
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

/** Снимок состояния для UI плеера (нижняя полоса). */
export interface PlaybackState {
  status: PlaybackStatus;
  playlistId: Id | null;
  playlistName: string | null;
  trackId: Id | null;
  trackName: string | null;
  /** индекс текущего трека в плейлисте (−1 если ничего не играет) */
  trackIndex: number;
  trackCount: number;
  positionSec: number;
  durationSec: number;
  /** музыка сейчас приглушена под объявление */
  ducked: boolean;
  announcementName: string | null;
  /** мастер-громкость, 0..100 */
  masterVolume: number;
}

/** Колбэки движка (для планировщика/эфира — Чаты 5 и 9). */
export interface EngineConfig {
  /** плейлист доиграл до конца (не зациклен) — эфир решит, что дальше */
  onPlaylistEnd?: (playlistId: Id) => void;
}

export type Unsubscribe = () => void;
