import { useState, useCallback, useRef, useEffect } from 'react'
import { AudioEngine } from '../audio/AudioEngine'
import { Playlist, Announcement, ScheduledAnn } from '../types'

export interface PlayerState {
  playing: boolean
  currentTrack: string
  currentPlaylist: string
  progress: number
  elapsed: number
  duration: number
  volume: number
}

export function usePlayer() {
  const [state, setState] = useState<PlayerState>({
    playing: false, currentTrack: '', currentPlaylist: '',
    progress: 0, elapsed: 0, duration: 0, volume: 0.75,
  })

  const engineRef = useRef<AudioEngine | null>(null)

  function getEngine(): AudioEngine {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine(patch => {
        setState(s => ({ ...s, ...patch }))
      })
      engineRef.current.setVolume(0.75)
    }
    return engineRef.current
  }

  const loadAndPlay = useCallback((pl: Playlist, trackIdx = 0) => {
    const eng = getEngine()
    eng.loadPlaylist(pl, trackIdx)
    eng.play()
  }, [])

  const pause = useCallback(() => getEngine().pause(), [])
  const stop = useCallback(() => getEngine().stop(), [])
  const next = useCallback(() => getEngine().next(), [])
  const prev = useCallback(() => getEngine().prev(), [])
  const seekPercent = useCallback((p: number) => getEngine().seekPercent(p), [])

  const setVolume = useCallback((v: number) => {
    setState(s => ({ ...s, volume: v }))
    getEngine().setVolume(v)
  }, [])

  const playAnnouncement = useCallback((ann: Announcement, duck: number) => {
    getEngine().playAnnouncement(ann, duck)
  }, [])

  const fadeOut = useCallback((sec: number) => {
    getEngine().fadeOut(sec)
  }, [])

  return { state, loadAndPlay, pause, stop, next, prev, seekPercent, setVolume, playAnnouncement, fadeOut }
}
