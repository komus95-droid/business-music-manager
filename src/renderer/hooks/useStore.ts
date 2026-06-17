import { useState, useEffect, useCallback } from 'react'
import {
  AppState, Playlist, Announcement, DaySchedule, Holiday,
  DEFAULT_WEEK, DEFAULT_EQ, COLORS
} from '../types'

const isElectron = typeof window !== 'undefined' && !!window.bmm

const DEMO_PLAYLISTS: Playlist[] = [
  { id: 'pl1', name: 'Утренний джаз', folder: '/music/jazz', color: 0, transition: 'crossfade3', files: [] },
  { id: 'pl2', name: 'Дневной поп',   folder: '/music/pop',  color: 1, transition: 'crossfade3', files: [] },
  { id: 'pl3', name: 'Вечерний лаунж',folder: '/music/lounge',color:2, transition: 'pause1',     files: [] },
]

const DEMO_ANNS: Announcement[] = [
  { id: 'a1', name: 'Акция недели',  file: 'akcia.mp3',   dur: '0:48' },
  { id: 'a2', name: 'Часы работы',   file: 'hours.mp3',   dur: '0:32' },
  { id: 'a3', name: 'Новинки',       file: 'novinki.mp3', dur: '1:05' },
  { id: 'a4', name: 'Скидки −20%',   file: 'skidki.mp3',  dur: '0:41' },
]

const DEMO_WEEK: DaySchedule[] = DEFAULT_WEEK.map((d, i) => ({
  ...d,
  playlistId: i % 2 === 0 ? 'pl1' : 'pl2',
  anns: i === 1 ? [{ annId: 'a1', time: '11:30', vol: 20 }, { annId: 'a2', time: '14:00', vol: 20 }]
      : i === 3 ? [{ annId: 'a4', time: '15:30', vol: 20 }]
      : i === 4 ? [{ annId: 'a1', time: '10:00', vol: 25 }] : [],
}))

const INITIAL: AppState = {
  playlists: DEMO_PLAYLISTS,
  announcements: DEMO_ANNS,
  week: DEMO_WEEK,
  holidays: [
    { id: 'h1', name: 'День России', on: true,  type: 'single', from: '2026-06-12', to: '', start: '11:00', end: '20:00', fadeOut: 20, playlistId: 'pl3', anns: [], open: false },
    { id: 'h2', name: 'Ид аль-Адха', on: false, type: 'range',  from: '2026-06-06', to: '2026-06-08', start: '10:00', end: '21:00', fadeOut: 20, playlistId: 'pl2', anns: [], open: false },
  ],
  eq: DEFAULT_EQ,
  mode: 'broadcast',
  theme: 'dark',
}

async function persist(key: string, val: unknown) {
  if (isElectron) await window.bmm.save(key, val)
}

export function useStore() {
  const [state, setState] = useState<AppState>(INITIAL)

  useEffect(() => {
    if (!isElectron) return
    ;(async () => {
      const [playlists, anns, week, holidays, eq, prefs] = await Promise.all([
        window.bmm.load('playlists', DEMO_PLAYLISTS),
        window.bmm.load('announcements', DEMO_ANNS),
        window.bmm.load('week', DEMO_WEEK),
        window.bmm.load('holidays', INITIAL.holidays),
        window.bmm.load('eq', DEFAULT_EQ),
        window.bmm.load('prefs', { mode: 'broadcast', theme: 'dark' }),
      ])
      setState(s => ({
        ...s,
        playlists: playlists as Playlist[],
        announcements: anns as Announcement[],
        week: week as DaySchedule[],
        holidays: holidays as Holiday[],
        eq: eq as typeof DEFAULT_EQ,
        mode: (prefs as { mode: string }).mode as AppState['mode'],
        theme: (prefs as { theme: string }).theme as AppState['theme'],
      }))
    })()
  }, [])

  const update = useCallback(<K extends keyof AppState>(key: K, val: AppState[K]) => {
    setState(s => ({ ...s, [key]: val }))
    persist(key, val)
  }, [])

  // Helpers
  const getPl = (id: string) => state.playlists.find(p => p.id === id)
  const getAnn = (id: string) => state.announcements.find(a => a.id === id)

  const plUsedIn = (id: string) => {
    const days = state.week.filter(d => d.playlistId === id && d.on).map((_, i) => ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i])
    const hols = state.holidays.filter(h => h.playlistId === id && h.on).map(h => h.name)
    return [...days, ...hols]
  }
  const annUsedIn = (id: string) => {
    const days = state.week.filter(d => d.anns.some(a => a.annId === id)).map((_, i) => ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i])
    const hols = state.holidays.filter(h => h.anns.some(a => a.annId === id)).map(h => h.name)
    return [...days, ...hols]
  }

  const addPlaylist = useCallback(async (name: string) => {
    const col = state.playlists.length % COLORS.length
    const folder = isElectron ? (await window.bmm.pickFolder() || '') : '/music/new'
    const files = folder && isElectron ? await window.bmm.scanFolder(folder) : []
    const pl: Playlist = { id: 'pl' + Date.now(), name, folder, color: col, transition: 'crossfade3', files }
    const next = [...state.playlists, pl]
    update('playlists', next)
    return pl
  }, [state.playlists, update])

  const addAnnouncement = useCallback(async (name: string) => {
    const paths = isElectron ? await window.bmm.pickFiles() : []
    const file = paths[0] || name + '.mp3'
    const ann: Announcement = { id: 'a' + Date.now(), name, file: file.split(/[/\\]/).pop() || file, dur: '0:00' }
    const next = [...state.announcements, ann]
    update('announcements', next)
    return ann
  }, [state.announcements, update])

  return { state, update, getPl, getAnn, plUsedIn, annUsedIn, addPlaylist, addAnnouncement }
}
