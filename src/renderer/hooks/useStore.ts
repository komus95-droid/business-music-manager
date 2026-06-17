import { useState, useEffect, useCallback, useRef } from 'react'
import { AppState, Playlist, Announcement, DaySchedule, Holiday, DEFAULT_WEEK, DEFAULT_EQ, COLORS } from '../types'

const isElectron = typeof window !== 'undefined' && !!window.bmm

const DEFAULT_PLAYLISTS: Playlist[] = []
const DEFAULT_ANNS: Announcement[] = []

const INITIAL: AppState = {
  playlists: DEFAULT_PLAYLISTS,
  announcements: DEFAULT_ANNS,
  week: DEFAULT_WEEK,
  holidays: [],
  eq: DEFAULT_EQ,
  mode: 'broadcast',
  theme: 'dark',
}

async function persist(key: string, val: unknown) {
  if (isElectron) await window.bmm.save(key, val)
}

// Get audio duration using HTML5 Audio
function getAudioDuration(filePath: string): Promise<number> {
  return new Promise(resolve => {
    const src = filePath.startsWith('file://') ? filePath : `file://${filePath.replace(/\\/g, '/')}`
    const audio = new Audio(src)
    audio.addEventListener('loadedmetadata', () => resolve(audio.duration || 0))
    audio.addEventListener('error', () => resolve(0))
    setTimeout(() => resolve(0), 5000)
  })
}

export function useStore() {
  const [state, setState] = useState<AppState>(INITIAL)
  const [dirty, setDirty] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isElectron) return
    ;(async () => {
      const [pls, anns, week, holidays, eq, prefs] = await Promise.all([
        window.bmm.load('playlists', []),
        window.bmm.load('announcements', []),
        window.bmm.load('week', DEFAULT_WEEK),
        window.bmm.load('holidays', []),
        window.bmm.load('eq', DEFAULT_EQ),
        window.bmm.load('prefs', { mode: 'broadcast', theme: 'dark' }),
      ])
      setState(s => ({
        ...s,
        playlists: pls as Playlist[],
        announcements: anns as Announcement[],
        week: week as DaySchedule[],
        holidays: holidays as Holiday[],
        eq: eq as typeof DEFAULT_EQ,
        mode: (prefs as { mode: string }).mode as AppState['mode'],
        theme: (prefs as { theme: string }).theme as AppState['theme'],
      }))
    })()
  }, [])

  // Auto-save 30s
  useEffect(() => {
    if (!dirty) return
    if (autoTimer.current) clearTimeout(autoTimer.current)
    autoTimer.current = setTimeout(() => saveAll(), 30000)
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current) }
  }, [dirty, state])

  const saveAll = useCallback(async () => {
    await Promise.all([
      persist('playlists', state.playlists),
      persist('announcements', state.announcements),
      persist('week', state.week),
      persist('holidays', state.holidays),
      persist('eq', state.eq),
      persist('prefs', { mode: state.mode, theme: state.theme }),
    ])
    setDirty(false)
    setLastSaved(new Date())
  }, [state])

  const update = useCallback(<K extends keyof AppState>(key: K, val: AppState[K]) => {
    setState(s => ({ ...s, [key]: val }))
    setDirty(true)
  }, [])

  const getPl = (id: string) => state.playlists.find(p => p.id === id)
  const getAnn = (id: string) => state.announcements.find(a => a.id === id)

  const plUsedIn = (id: string) => {
    const days = state.week.filter(d => d.playlistId === id && d.on).map((_, i) => DAYS[i])
    const hols = state.holidays.filter(h => h.playlistId === id && h.on).map(h => h.name)
    return [...days, ...hols]
  }
  const annUsedIn = (id: string) => {
    const days = state.week.filter(d => d.anns.some(a => a.annId === id)).map((_, i) => DAYS[i])
    const hols = state.holidays.filter(h => h.anns.some(a => a.annId === id)).map(h => h.name)
    return [...days, ...hols]
  }

  // Add tracks to playlist (copies into app storage)
  const addTracksToPlaylist = useCallback(async (plId: string, srcPaths: string[]) => {
    if (!isElectron) return
    const copied = await window.bmm.copyToPlaylist(plId, srcPaths)
    // Get durations
    const tracks = await Promise.all(copied.map(async t => ({
      name: t.name, path: t.path, size: t.size,
      dur: await getAudioDuration(t.path)
    })))
    const next = state.playlists.map(pl => {
      if (pl.id !== plId) return pl
      const newTracks = [...pl.tracks, ...tracks.filter(t => !pl.tracks.find(e => e.path === t.path))]
      return {
        ...pl, tracks: newTracks,
        totalDur: newTracks.reduce((s, t) => s + t.dur, 0),
        totalSize: newTracks.reduce((s, t) => s + t.size, 0),
      }
    })
    update('playlists', next)
  }, [state.playlists, update])

  const addFolderToPlaylist = useCallback(async (plId: string) => {
    if (!isElectron) return
    const folder = await window.bmm.pickFolder()
    if (!folder) return
    const copied = await window.bmm.copyFolderToPlaylist(plId, folder)
    const tracks = await Promise.all(copied.map(async t => ({
      name: t.name, path: t.path, size: t.size,
      dur: await getAudioDuration(t.path)
    })))
    const next = state.playlists.map(pl => {
      if (pl.id !== plId) return pl
      const newTracks = [...pl.tracks, ...tracks.filter(t => !pl.tracks.find(e => e.path === t.path))]
      return {
        ...pl, tracks: newTracks,
        totalDur: newTracks.reduce((s, t) => s + t.dur, 0),
        totalSize: newTracks.reduce((s, t) => s + t.size, 0),
      }
    })
    update('playlists', next)
  }, [state.playlists, update])

  const addPlaylist = useCallback(async (name: string) => {
    const col = state.playlists.length % COLORS.length
    const pl: Playlist = { id: 'pl' + Date.now(), name, color: col, transition: 'crossfade3', tracks: [], totalDur: 0, totalSize: 0 }
    update('playlists', [...state.playlists, pl])
    return pl
  }, [state.playlists, update])

  const deletePlaylist = useCallback(async (plId: string) => {
    if (isElectron) await window.bmm.deletePlaylist(plId)
    update('playlists', state.playlists.filter(p => p.id !== plId))
  }, [state.playlists, update])

  const addAnnouncement = useCallback(async (name: string) => {
    const id = 'a' + Date.now()
    let filePath = '', size = 0, dur = 0
    if (isElectron) {
      const paths = await window.bmm.pickFiles()
      if (paths.length) {
        const result = await window.bmm.copyAnnouncement(id, paths[0])
        filePath = result.path; size = result.size
        dur = await getAudioDuration(filePath)
      }
    }
    const ann: Announcement = { id, name, path: filePath, size, dur }
    update('announcements', [...state.announcements, ann])
    return ann
  }, [state.announcements, update])

  const deleteAnnouncement = useCallback(async (annId: string) => {
    if (isElectron) await window.bmm.deleteAnnouncement(annId)
    update('announcements', state.announcements.filter(a => a.id !== annId))
  }, [state.announcements, update])

  return {
    state, update, dirty, lastSaved, saveAll,
    getPl, getAnn, plUsedIn, annUsedIn,
    addPlaylist, addTracksToPlaylist, addFolderToPlaylist, deletePlaylist,
    addAnnouncement, deleteAnnouncement,
  }
}

const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
