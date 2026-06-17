export interface AudioFile { name: string; path: string }

export interface Playlist {
  id: string; name: string; folder: string
  color: number  // index into COLORS
  transition: 'crossfade3' | 'crossfade5' | 'pause1' | 'none'
  files: AudioFile[]
}

export interface Announcement {
  id: string; name: string; file: string; dur: string
}

export interface ScheduledAnn {
  annId: string; time: string; vol: number  // vol = music level during ann (5-60%)
}

export interface DaySchedule {
  on: boolean; start: string; end: string
  fadeOut: number  // seconds: 10 | 20 | 30
  playlistId: string
  anns: ScheduledAnn[]
  open: boolean
}

export interface Holiday {
  id: string; name: string; on: boolean
  type: 'single' | 'range'
  from: string; to: string
  start: string; end: string
  fadeOut: number
  playlistId: string
  anns: ScheduledAnn[]
  open: boolean
}

export type BroadcastMode = 'broadcast' | 'studio'

export interface EQState {
  bands: number[]  // 10 values -12..+12
  volume: number   // 0-100
  balance: number  // -100..100
}

export interface AppState {
  playlists: Playlist[]
  announcements: Announcement[]
  week: DaySchedule[]
  holidays: Holiday[]
  eq: EQState
  mode: BroadcastMode
  theme: 'dark' | 'light'
}

declare global {
  interface Window {
    bmm: {
      load: (key: string, fb: unknown) => Promise<unknown>
      save: (key: string, val: unknown) => Promise<boolean>
      pickFolder: () => Promise<string | null>
      pickFiles: () => Promise<string[]>
      scanFolder: (p: string) => Promise<AudioFile[]>
      openData: () => Promise<void>
    }
  }
}

export const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

export const COLORS = [
  { c: '#7B6FE8', bg: '#2D2860', bgL: '#EEEDFE', cL: '#3C3489' },
  { c: '#1D9E75', bg: '#061A12', bgL: '#E1F5EE', cL: '#085041' },
  { c: '#EF9F27', bg: '#1C1508', bgL: '#FAEEDA', cL: '#633806' },
  { c: '#D85A30', bg: '#1C0A06', bgL: '#FAECE7', cL: '#712B13' },
  { c: '#378ADD', bg: '#042C53', bgL: '#E6F1FB', cL: '#0C447C' },
]

export const DEFAULT_WEEK: DaySchedule[] = DAYS.map((_, i) => ({
  on: i < 6, start: i >= 5 ? '10:00' : '09:00',
  end: i >= 4 ? '22:00' : '21:00',
  fadeOut: 20, playlistId: '', anns: [], open: false
}))

export const DEFAULT_EQ: EQState = { bands: Array(10).fill(0), volume: 75, balance: 0 }

export const EQ_PRESETS: Record<string, number[]> = {
  'Нейтрал':  [0,0,0,0,0,0,0,0,0,0],
  'Магазин':  [2,2,0,-1,-1,0,1,2,2,1],
  'Речь':     [-2,0,2,4,4,3,2,1,0,-1],
  'Бас':      [5,4,3,1,0,0,0,0,0,0],
  'Клубный':  [4,3,0,2,0,-1,0,2,3,3],
}

export const EQ_FREQS = ['32','64','125','250','500','1k','2k','4k','8k','16k']

export function timeToFrac(t: string, startH: number, totalH: number): number {
  const [h, m] = t.split(':').map(Number)
  return Math.max(0, Math.min(0.97, (h + m / 60 - startH) / totalH))
}

export function fracToTime(f: number, startH: number, totalH: number): string {
  const tot = Math.round(f * totalH * 60)
  const h = startH + Math.floor(tot / 60)
  const m = tot % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

export function fmtDate(d: string): string {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) }
  catch { return d }
}

export function todayHoliday(holidays: Holiday[]): Holiday | null {
  const today = new Date().toISOString().slice(0, 10)
  return holidays.find(h => {
    if (!h.on) return false
    if (h.type === 'single') return h.from === today
    return h.from <= today && today <= (h.to || h.from)
  }) || null
}
