/**
 * Аудио-движок Commercial Player (Чат 4) — renderer-side, поверх Howler.js.
 *
 * Покрывает требования передачи из Чата 3:
 *   1. Воспроизведение плейлиста с равномощным кроссфейдом между треками
 *      (если Playlist.crossfade), сила = AudioSettings.fadeOverlap (0..20 сек).
 *   2. Дакинг: на время объявления музыка приглушается до AudioSettings.ducking %.
 *   3. Громкость объявления — Announcement.volume; мастер — AudioSettings.volume.
 *   4. 10-полосный EQ (см. eq.ts) — WebAudio в мастер-шине Howler.
 *   5. smoothing (0..100) — длительность мягких переходов (дакинг, анти-клик).
 *   6. Плавное затухание в конце дня — AudioSettings.endOfDayFadeSec (10|20|30).
 *
 * Модель громкости (важно):
 *   мастер  → Howler.volume()           (глобально, музыка + объявления)
 *   музыка  → Howl.volume(env×duck×end) (поинстансно, считается тут)
 *   объявл. → Howl.volume(volume/100)   (не дакается, не затухает в конце дня)
 * Огибающие env/duck/end независимы и сводятся произведением в одном тикере.
 *
 * Команды play/pause/stop/duck приходят извне — планировщик и эфир (Чаты 5, 9)
 * держат один экземпляр движка и дёргают его методы.
 */

import { Howl, Howler } from 'howler';
import type { AudioSettings, Id } from '@shared';
import { FADE_OVERLAP_MAX } from '@shared';

import { EqChain } from './eq';
import {
  Ramp, easeInOut, linear, eqPowerIn, eqPowerOut, clamp, clamp01,
} from './ramp';
import type {
  PlayPlaylistRequest, PlayAnnouncementRequest,
  PlaybackState, PlaybackStatus, EngineConfig, Unsubscribe,
} from './types';

const TICK_MS = 40;            // ~25 Гц, работает и в свёрнутом окне (см. примечание)
const STATE_EVERY = 4;         // эмитим состояние ~каждые 160 мс
const ANTICLICK_SEC = 0.04;    // минимальный фейд, чтобы не щёлкало на стыках
const SMOOTH_MAX_SEC = 1.5;    // smoothing=100 → 1.5 c

type Fading = 'in' | 'out' | 'steady';

interface MusicInstance {
  howl: Howl;
  id: number;
  trackIndex: number;
  /** огибающая кроссфейда 0..1 */
  envelope: Ramp;
  fading: Fading;
}

export class AudioEngine {
  private audio: AudioSettings;
  private readonly config: EngineConfig;

  private readonly eq = new EqChain();
  /** глобальный коэффициент приглушения музыки (1 → ducking/100 → 1) */
  private readonly duck = new Ramp(1, easeInOut);
  /** затухание музыки в конце дня / при stop с фейдом (1 → 0) */
  private readonly endFade = new Ramp(1, linear);

  private music: MusicInstance[] = [];
  private req: PlayPlaylistRequest | null = null;
  private startedNext = false;   // защёлка: переход к следующему треку уже запущен
  private stopping = false;      // идёт затухание перед остановкой

  private ann: { howl: Howl; id: number; name: string } | null = null;
  private annVolume = 0;
  private annRefCount = 0;

  private status: PlaybackStatus = 'idle';
  private timer: number | null = null;
  private lastTick = 0;
  private stateCounter = 0;

  private readonly listeners = new Set<(s: PlaybackState) => void>();

  constructor(audio: AudioSettings, config: EngineConfig = {}) {
    this.audio = audio;
    this.config = config;
    Howler.volume(clamp01(audio.volume / 100));
    if (this.eq.ensure()) this.eq.apply(audio.eq);
  }

  // ── Настройки звука ──────────────────────────────────────────────────────

  /** Применить актуальные AudioSettings (мастер, EQ; дакинг — на лету). */
  applyAudioSettings(audio: AudioSettings): void {
    this.audio = audio;
    Howler.volume(clamp01(audio.volume / 100));
    if (this.eq.ensure()) this.eq.apply(audio.eq);
    if (this.annRefCount > 0) {
      this.duck.rampTo(clamp01(audio.ducking / 100), this.duckTime());
    }
    this.emit();
  }

  /** Мастер-громкость из ползунка плеера (0..100). */
  setMasterVolume(v: number): void {
    this.audio = { ...this.audio, volume: clamp(Math.round(v), 0, 100) };
    Howler.volume(clamp01(this.audio.volume / 100));
    this.emit();
  }

  // ── Плейлист ───────────────────────────────────────────────────────────────

  /** Запустить плейлист (предыдущая музыка снимается без фейда). */
  playPlaylist(req: PlayPlaylistRequest): void {
    this.resumeCtx();
    if (this.eq.ensure()) this.eq.apply(this.audio.eq);

    this.hardStopMusic();
    if (req.tracks.length === 0) {
      this.status = 'idle';
      this.emit();
      return;
    }

    this.req = req;
    this.status = 'playing';
    this.startedNext = false;
    this.stopping = false;
    this.endFade.jump(1);

    const idx = clamp(Math.round(req.startIndex ?? 0), 0, req.tracks.length - 1);
    this.startTrack(idx, Math.max(0, req.startOffsetSec ?? 0), this.smoothingSec(), 'in');
    this.startTicker();
    this.emit();
  }

  pause(): void {
    if (this.status !== 'playing') return;
    for (const m of this.music) m.howl.pause(m.id);
    if (this.ann) this.ann.howl.pause(this.ann.id);
    this.status = 'paused';
    this.stopTicker(); // огибающие замирают — tick не вызывается
    this.emit();
  }

  resume(): void {
    if (this.status !== 'paused') return;
    for (const m of this.music) m.howl.play(m.id);
    if (this.ann) this.ann.howl.play(this.ann.id);
    this.status = 'playing';
    this.startTicker();
    this.emit();
  }

  /** Остановить музыку. fadeSec > 0 — плавно (используется концом дня). */
  stop(opts?: { fadeSec?: number }): void {
    const fade = Math.max(0, opts?.fadeSec ?? 0);
    if (fade > 0 && this.music.length > 0) {
      this.stopping = true;
      this.endFade.setEase(linear);
      this.endFade.rampTo(0, fade);
      this.startTicker();
      this.emit();
      return;
    }
    this.killAnnouncement();
    this.hardStopMusic();
    this.status = 'idle';
    this.emit();
  }

  /** Конец рабочего дня — плавное затухание на AudioSettings.endOfDayFadeSec. */
  fadeOutAndStop(): void {
    this.stop({ fadeSec: this.audio.endOfDayFadeSec });
  }

  /** Перемотка текущего трека (Студия). */
  seek(sec: number): void {
    const lead = this.lead();
    if (!lead || !this.req) return;
    const target = Math.max(0, sec);
    lead.howl.seek(target, lead.id);
    const dur = this.trackDur(lead);
    const nextIdx = Math.min(lead.trackIndex + 1, this.req.tracks.length - 1);
    if (dur - target > this.transitionOverlap(lead.trackIndex, nextIdx) + 0.1) {
      this.startedNext = false; // отъехали от зоны кроссфейда — разрешим новый
    }
    this.emit();
  }

  // ── Объявления (дакинг) ─────────────────────────────────────────────────────

  /** Проиграть объявление: приглушить музыку, по окончании — вернуть. */
  playAnnouncement(req: PlayAnnouncementRequest): void {
    this.resumeCtx();
    if (this.eq.ensure()) this.eq.apply(this.audio.eq);

    const howl = new Howl({ src: [req.url], html5: false, preload: true });
    howl.once('loaderror', (_id: number, err: unknown) => {
      console.error('[AUDIO] Ошибка загрузки объявления:', req.url, err);
      this.onAnnouncementEnd(howl);
    });
    howl.once('playerror', (_id: number, err: unknown) => {
      console.error('[AUDIO] Ошибка воспроизведения объявления:', req.url, err);
      this.onAnnouncementEnd(howl);
    });
    howl.once('end', () => this.onAnnouncementEnd(howl));

    const id = howl.play();
    this.annVolume = clamp01(req.volume / 100);
    howl.volume(this.annVolume, id);

    this.ann = { howl, id, name: req.name };
    this.annRefCount += 1;
    this.duck.setEase(easeInOut);
    this.duck.rampTo(clamp01(this.audio.ducking / 100), this.duckTime());

    this.startTicker();
    this.emit();
  }

  private onAnnouncementEnd(howl: Howl): void {
    howl.stop();
    howl.unload();
    if (this.ann && this.ann.howl === howl) this.ann = null;
    this.annRefCount = Math.max(0, this.annRefCount - 1);
    if (this.annRefCount === 0) {
      this.duck.setEase(easeInOut);
      this.duck.rampTo(1, this.duckTime());
    }
    this.emit();
  }

  private killAnnouncement(): void {
    if (this.ann) {
      this.ann.howl.stop();
      this.ann.howl.unload();
      this.ann = null;
    }
    this.annRefCount = 0;
    this.duck.jump(1);
  }

  // ── Подписка на состояние / завершение ──────────────────────────────────────

  onState(cb: (s: PlaybackState) => void): Unsubscribe {
    this.listeners.add(cb);
    cb(this.snapshot());
    return () => this.listeners.delete(cb);
  }

  getState(): PlaybackState {
    return this.snapshot();
  }

  destroy(): void {
    this.stopTicker();
    this.killAnnouncement();
    this.hardStopMusic();
    this.listeners.clear();
  }

  // ── Внутреннее: треки и переходы ────────────────────────────────────────────

  private lead(): MusicInstance | null {
    return this.music.length > 0 ? this.music[this.music.length - 1] : null;
  }

  private startTrack(index: number, offsetSec: number, fadeSec: number, dir: Fading): void {
    const t = this.req!.tracks[index];
    console.warn('[AUDIO] старт трека:', t.url); // диагностика: видеть попытку проигрывания
    const howl = new Howl({ src: [t.url], html5: false, preload: true });
    howl.once('loaderror', (_id: number, err: unknown) =>
      console.error('[AUDIO] Ошибка загрузки трека:', t.url, err));
    howl.once('playerror', (_id: number, err: unknown) =>
      console.error('[AUDIO] Ошибка воспроизведения трека:', t.url, err));

    const id = howl.play();
    if (offsetSec > 0) howl.once('play', () => howl.seek(offsetSec, id));

    const envelope = new Ramp(dir === 'in' ? 0 : 1);
    if (dir === 'in') {
      envelope.setEase(eqPowerIn);
      envelope.rampTo(1, fadeSec);
    } else {
      envelope.jump(1);
    }

    this.music.push({ howl, id, trackIndex: index, envelope, fading: dir });
  }

  /** Длина кроссфейда между двумя треками с учётом их длительностей. */
  private transitionOverlap(aIdx: number, bIdx: number): number {
    const base = this.req!.crossfade
      ? clamp(this.audio.fadeOverlap, 0, FADE_OVERLAP_MAX)
      : ANTICLICK_SEC;
    const aDur = this.req!.tracks[aIdx]?.durationSec || Number.POSITIVE_INFINITY;
    const bDur = this.req!.tracks[bIdx]?.durationSec || Number.POSITIVE_INFINITY;
    return Math.max(ANTICLICK_SEC, Math.min(base, aDur * 0.45, bDur * 0.45));
  }

  private maybeAdvance(): void {
    if (this.status !== 'playing' || !this.req || this.stopping) return;
    const lead = this.lead();
    if (!lead) return;

    const dur = this.trackDur(lead);
    if (dur <= 0) return;
    const remaining = dur - this.posOf(lead);

    const nextIndex = lead.trackIndex + 1;
    const hasNext = nextIndex < this.req.tracks.length;

    if (!this.startedNext && hasNext) {
      const overlap = this.transitionOverlap(lead.trackIndex, nextIndex);
      if (remaining <= Math.max(overlap, ANTICLICK_SEC)) {
        this.startTrack(nextIndex, 0, overlap, 'in');
        lead.fading = 'out';
        lead.envelope.setEase(eqPowerOut);
        lead.envelope.rampTo(0, overlap);
        this.startedNext = true;
      }
      return;
    }

    if (!hasNext && remaining <= 0.03) {
      this.completePlaylist();
    }
  }

  private completePlaylist(): void {
    const req = this.req;
    if (req?.loop) {
      this.hardStopMusic(true);
      this.req = req;
      this.startedNext = false;
      this.endFade.jump(1);
      this.startTrack(0, 0, this.smoothingSec(), 'in');
      return;
    }
    const plId = req?.playlistId ?? null;
    this.hardStopMusic();
    this.status = 'idle';
    this.emit();
    if (plId) this.config.onPlaylistEnd?.(plId);
  }

  private posOf(m: MusicInstance): number {
    const v = m.howl.seek();
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }

  private trackDur(m: MusicInstance): number {
    const d = m.howl.duration();
    return d && d > 0 ? d : this.req!.tracks[m.trackIndex].durationSec;
  }

  private hardStopMusic(keepReq = false): void {
    for (const m of this.music) {
      m.howl.stop(m.id);
      m.howl.unload();
    }
    this.music = [];
    this.startedNext = false;
    this.stopping = false;
    this.endFade.jump(1);
    if (!keepReq) this.req = null;
  }

  // ── Тикер: огибающие → громкости → состояние ────────────────────────────────

  private startTicker(): void {
    if (this.timer != null) return;
    this.lastTick = performance.now();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private stopTicker(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const now = performance.now();
    const dt = now - this.lastTick;
    this.lastTick = now;

    this.duck.tick(dt);
    this.endFade.tick(dt);
    for (const m of this.music) m.envelope.tick(dt);

    this.maybeAdvance();
    this.applyVolumes();
    this.cleanup();

    if (this.stopping && this.endFade.done && this.endFade.value <= 0.001) {
      this.killAnnouncement();
      this.hardStopMusic();
      this.status = 'idle';
      this.emit();
    }

    if (++this.stateCounter >= STATE_EVERY) {
      this.stateCounter = 0;
      this.emit();
    }

    // Простаиваем — гасим тикер, чтобы не крутить вхолостую.
    const idle =
      this.status !== 'playing' &&
      this.music.length === 0 &&
      this.ann === null &&
      this.duck.done &&
      this.endFade.done;
    if (idle) this.stopTicker();
  }

  private applyVolumes(): void {
    const duck = this.duck.value;
    const end = this.endFade.value;
    for (const m of this.music) {
      m.howl.volume(clamp01(m.envelope.value * duck * end), m.id);
    }
    if (this.ann) this.ann.howl.volume(this.annVolume, this.ann.id);
  }

  private cleanup(): void {
    for (let i = this.music.length - 1; i >= 0; i--) {
      const m = this.music[i];
      const isLead = i === this.music.length - 1;
      if (!isLead && m.fading === 'out' && m.envelope.done && m.envelope.value <= 0.001) {
        m.howl.stop(m.id);
        m.howl.unload();
        this.music.splice(i, 1);
        this.startedNext = false; // новый lead сможет запланировать свой переход
      }
    }
  }

  // ── Тайминги из smoothing ────────────────────────────────────────────────────

  private smoothingSec(): number {
    return ANTICLICK_SEC + clamp01(this.audio.smoothing / 100) * SMOOTH_MAX_SEC;
  }

  private duckTime(): number {
    return Math.max(0.08, this.smoothingSec());
  }

  // ── Прочее ─────────────────────────────────────────────────────────────────

  private resumeCtx(): void {
    const ctx = Howler.ctx;
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const snap = this.snapshot();
    for (const cb of this.listeners) cb(snap);
  }

  private snapshot(): PlaybackState {
    const lead = this.lead();
    const track = lead && this.req ? this.req.tracks[lead.trackIndex] : null;
    const master = Howler.volume();
    return {
      status: this.status,
      playlistId: this.req?.playlistId ?? null,
      playlistName: this.req?.name ?? null,
      trackId: track?.id ?? null,
      trackName: track?.name ?? null,
      trackIndex: lead?.trackIndex ?? -1,
      trackCount: this.req?.tracks.length ?? 0,
      positionSec: lead ? this.posOf(lead) : 0,
      durationSec: lead ? this.trackDur(lead) : 0,
      ducked: this.annRefCount > 0,
      announcementName: this.ann?.name ?? null,
      masterVolume: Math.round((typeof master === 'number' ? master : 1) * 100),
    };
  }
}

/** Фабрика — обычно в renderer держим один экземпляр. */
export function createAudioEngine(audio: AudioSettings, config?: EngineConfig): AudioEngine {
  return new AudioEngine(audio, config);
}

export type { Id };
