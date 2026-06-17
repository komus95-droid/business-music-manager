import { Howl, Howler } from 'howler'
import { Playlist, Announcement, ScheduledAnn, fmtDur } from '../types'

export interface PlayerState {
  playing: boolean
  currentTrack: string
  currentPlaylist: string
  progress: number        // 0-1
  elapsed: number         // seconds
  duration: number        // seconds
  volume: number          // 0-1
  dayProgress: number     // 0-1 within day
  dayElapsed: number      // minutes from day start
  nextAnn: ScheduledAnn | null
  nextAnnName: string
}

const CROSSFADE_MS = 3000
const FADE_SHORT = 1000

export class AudioEngine {
  private howl: Howl | null = null
  private nextHowl: Howl | null = null
  private playlist: Playlist | null = null
  private trackIdx = 0
  private volume = 0.8
  private annVolume = 0.2       // music volume during announcement
  private isPlaying = false
  private progressTimer: ReturnType<typeof setInterval> | null = null
  private onStateChange: (s: Partial<PlayerState>) => void

  constructor(onStateChange: (s: Partial<PlayerState>) => void) {
    this.onStateChange = onStateChange
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.howl && this.isPlaying) this.howl.volume(this.volume)
    Howler.volume(this.volume)
  }

  loadPlaylist(pl: Playlist, startIdx = 0) {
    this.stop()
    this.playlist = pl
    this.trackIdx = startIdx
  }

  play() {
    if (!this.playlist?.tracks.length) return
    this._playTrack(this.trackIdx)
    this.isPlaying = true
    this._startTimer()
  }

  private _playTrack(idx: number) {
    const tracks = this.playlist!.tracks
    if (!tracks.length) return
    this.trackIdx = idx % tracks.length
    const track = tracks[this.trackIdx]

    if (this.howl) {
      const old = this.howl
      old.fade(this.volume, 0, CROSSFADE_MS)
      setTimeout(() => old.unload(), CROSSFADE_MS + 100)
    }

    // Convert local path to file:// URL
    const src = track.path.startsWith('file://') ? track.path : `file://${track.path.replace(/\\/g, '/')}`

    this.howl = new Howl({
      src: [src],
      volume: 0,
      html5: true,   // streaming, no memory spike
      onend: () => this._onTrackEnd(),
      onloaderror: () => {
        console.warn('Track load error:', track.path)
        setTimeout(() => this._playTrack(this.trackIdx + 1), 500)
      },
    })

    const transition = this.playlist!.transition
    if (transition === 'crossfade3' || transition === 'crossfade5') {
      this.howl.play()
      this.howl.fade(0, this.volume, transition === 'crossfade5' ? 5000 : CROSSFADE_MS)
    } else if (transition === 'pause1') {
      setTimeout(() => { this.howl?.volume(this.volume); this.howl?.play() }, 1000)
    } else {
      this.howl.volume(this.volume)
      this.howl.play()
    }

    this.onStateChange({
      playing: true,
      currentTrack: track.name,
      currentPlaylist: this.playlist!.name,
    })
  }

  private _onTrackEnd() {
    this._playTrack(this.trackIdx + 1)
  }

  pause() {
    this.howl?.fade(this.volume, 0, FADE_SHORT)
    setTimeout(() => this.howl?.pause(), FADE_SHORT)
    this.isPlaying = false
    this._stopTimer()
    this.onStateChange({ playing: false })
  }

  stop() {
    this.howl?.fade(this.volume, 0, FADE_SHORT)
    setTimeout(() => { this.howl?.unload(); this.howl = null }, FADE_SHORT + 100)
    this.isPlaying = false
    this._stopTimer()
    this.onStateChange({ playing: false, progress: 0, elapsed: 0 })
  }

  next() { this._playTrack(this.trackIdx + 1) }
  prev() { this._playTrack(Math.max(0, this.trackIdx - 1)) }

  seekPercent(pct: number) {
    if (!this.howl) return
    const dur = this.howl.duration()
    if (dur) this.howl.seek(dur * pct)
  }

  // Play announcement over music with ducking
  playAnnouncement(ann: Announcement, duckLevel: number, onEnd?: () => void) {
    if (!ann.path) return
    const src = ann.path.startsWith('file://') ? ann.path : `file://${ann.path.replace(/\\/g, '/')}`

    // Duck music
    if (this.howl) this.howl.fade(this.volume, this.volume * (duckLevel / 100), 800)

    const annHowl = new Howl({
      src: [src],
      volume: this.volume,
      html5: true,
      onend: () => {
        // Unduck music
        if (this.howl) this.howl.fade(this.volume * (duckLevel / 100), this.volume, 1200)
        annHowl.unload()
        onEnd?.()
      },
      onloaderror: () => {
        if (this.howl) this.howl.volume(this.volume)
        onEnd?.()
      }
    })
    annHowl.play()
  }

  // Fade out for end of day
  fadeOut(durationSec: number) {
    if (!this.howl) return
    this.howl.fade(this.volume, 0, durationSec * 1000)
    setTimeout(() => this.stop(), durationSec * 1000 + 100)
  }

  private _startTimer() {
    this._stopTimer()
    this.progressTimer = setInterval(() => {
      if (!this.howl || !this.isPlaying) return
      const seek = this.howl.seek() as number || 0
      const dur = this.howl.duration() || 1
      this.onStateChange({
        progress: seek / dur,
        elapsed: seek,
        duration: dur,
      })
    }, 500)
  }

  private _stopTimer() {
    if (this.progressTimer) { clearInterval(this.progressTimer); this.progressTimer = null }
  }

  isActive() { return this.isPlaying }
}

// Singleton
let _engine: AudioEngine | null = null
export function getEngine(cb: (s: Partial<PlayerState>) => void): AudioEngine {
  if (!_engine) _engine = new AudioEngine(cb)
  return _engine
}
