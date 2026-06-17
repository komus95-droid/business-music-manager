import React, { useState, useEffect } from 'react'
import { useStore } from './hooks/useStore'
import { DAYS, COLORS, EQ_PRESETS, EQ_FREQS, fmtDate, todayHoliday } from './types'
import DayBlock from './components/DayBlock'
import PlaylistEditor from './components/PlaylistEditor'
import AnnouncementEditor from './components/AnnouncementEditor'

type Tab = 'schedule' | 'playlists' | 'announcements' | 'player' | 'eq'

const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: 'schedule',      icon: 'ti-calendar-week',  label: 'Расписание' },
  { id: 'playlists',     icon: 'ti-music',           label: 'Плейлисты' },
  { id: 'announcements', icon: 'ti-speakerphone',    label: 'Объявления' },
  { id: 'player',        icon: 'ti-player-play',     label: 'Плеер' },
  { id: 'eq',            icon: 'ti-adjustments',     label: 'Эквалайзер' },
]

export default function App() {
  const {
    state, update, dirty, lastSaved, saveAll,
    getPl, getAnn, plUsedIn, annUsedIn,
    addPlaylist, addFilesToPlaylist, addFolderToPlaylist, addAnnouncement
  } = useStore()

  const [tab, setTab] = useState<Tab>('schedule')
  const [clock, setClock] = useState('')
  const [eqPreset, setEqPreset] = useState('Нейтрал')
  const [playing, setPlaying] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    document.body.className = state.theme === 'light' ? 'light' : ''
  }, [state.theme])

  // Window title dirty indicator
  useEffect(() => {
    document.title = dirty ? '● Business Music Manager' : 'Business Music Manager'
  }, [dirty])

  async function handleSave() {
    await saveAll()
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 2000)
  }

  const todayH = todayHoliday(state.holidays)
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
  const todayPlan = state.week[todayIdx]
  const activePlan = todayH || todayPlan
  const activePl = getPl(activePlan?.playlistId || '')

  function weekConflicts(i: number): string[] {
    const d = state.week[i]; const warns: string[] = []
    if (d.anns.length > 0 && !d.playlistId) warns.push('Объявления добавлены, но плейлист не выбран')
    return warns
  }
  function holConflicts(i: number): string[] {
    const warns: string[] = []; const h = state.holidays[i]
    if (!h.from) warns.push('Дата не задана — праздник не сработает')
    if (h.anns.length > 0 && !h.playlistId) warns.push('Объявления добавлены, но плейлист не выбран')
    if (h.on && h.from) {
      state.holidays.forEach((h2, j) => {
        if (j === i || !h2.on || !h2.from) return
        const overlap = h.type === 'single'
          ? (h2.type === 'single' ? h2.from === h.from : h2.from <= h.from && h.from <= (h2.to || h2.from))
          : (h2.from <= (h.to || h.from) && h.from <= (h2.to || h2.from))
        if (overlap) warns.push(`Конфликт дат с «${h2.name}» — система спросит при запуске`)
      })
    }
    return warns
  }

  const activeW = state.week.filter(d => d.on).length
  const filledW = state.week.filter(d => d.on && d.anns.length > 0).length
  const activeH = state.holidays.filter(h => h.on).length

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 196, flexShrink: 0, background: 'var(--bg2)', borderRight: '0.5px solid var(--bd)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 14px 12px', borderBottom: '0.5px solid var(--bd)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Business Music</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, letterSpacing: 0.4 }}>by RunBizAI</div>
        </div>
        <nav style={{ padding: 8, flex: 1 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 'var(--r)', border: 'none', width: '100%', textAlign: 'left', fontSize: 12, fontWeight: tab === n.id ? 500 : 400, background: tab === n.id ? 'var(--pu3)' : 'transparent', color: tab === n.id ? 'var(--puL)' : 'var(--text2)', marginBottom: 1, cursor: 'pointer' }}>
              <i className={`ti ${n.icon}`} aria-hidden="true" style={{ fontSize: 15, flexShrink: 0 }} />
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '10px 12px', borderTop: '0.5px solid var(--bd)' }}>
          <button onClick={() => update('theme', state.theme === 'dark' ? 'light' : 'dark')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
            <i className={`ti ${state.theme === 'dark' ? 'ti-sun' : 'ti-moon'}`} aria-hidden="true" />
            {state.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{ height: 52, flexShrink: 0, borderBottom: '0.5px solid var(--bd)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, background: 'var(--bg2)' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
            {NAV.find(n => n.id === tab)?.label}
            {dirty && <span style={{ color: 'var(--am)', marginLeft: 6, fontSize: 16, lineHeight: 1 }}>●</span>}
          </span>

          {/* Mode switcher */}
          <div style={{ display: 'flex', background: 'var(--bg3)', border: '0.5px solid var(--bd)', borderRadius: 'var(--r)', padding: 3, gap: 2, marginLeft: 4 }}>
            <button onClick={() => update('mode', 'broadcast')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: state.mode === 'broadcast' ? 'var(--teBg)' : 'transparent', color: state.mode === 'broadcast' ? 'var(--teL)' : 'var(--text3)' }}>
              <i className="ti ti-radio" aria-hidden="true" style={{ fontSize: 14 }} /> Вещание
            </button>
            <button onClick={() => update('mode', 'studio')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: state.mode === 'studio' ? 'var(--pu3)' : 'transparent', color: state.mode === 'studio' ? 'var(--puL)' : 'var(--text3)' }}>
              <i className="ti ti-microscope" aria-hidden="true" style={{ fontSize: 14 }} /> Студия
            </button>
          </div>

          {todayH && state.mode === 'broadcast' && (
            <span style={{ fontSize: 11, color: 'var(--amL)', background: 'var(--amBg)', border: '0.5px solid var(--am2)', padding: '3px 8px', borderRadius: 10 }}>
              ⭐ Праздник: {todayH.name}
            </span>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Unsaved indicator */}
            {dirty && (
              <span style={{ fontSize: 11, color: 'var(--amL)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-alert-circle" aria-hidden="true" style={{ fontSize: 13 }} />
                Несохранённые изменения
              </span>
            )}
            {!dirty && lastSaved && (
              <span style={{ fontSize: 11, color: 'var(--teL)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-check" aria-hidden="true" style={{ fontSize: 13 }} />
                Сохранено {lastSaved.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            {/* Save button */}
            <button onClick={handleSave}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 'var(--r)', border: 'none', background: dirty ? 'var(--pu2)' : saveFlash ? 'var(--te2)' : 'var(--bg3)', color: dirty ? '#EEEDFE' : saveFlash ? 'var(--teL)' : 'var(--text3)', fontSize: 12, fontWeight: dirty ? 500 : 400, cursor: 'pointer', transition: 'all 0.2s' }}>
              <i className={`ti ${saveFlash ? 'ti-check' : 'ti-device-floppy'}`} aria-hidden="true" />
              {saveFlash ? 'Сохранено' : 'Сохранить'}
            </button>

            {state.mode === 'broadcast' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teL)', animation: 'pulse 1.8s ease-in-out infinite' }} />
                <span style={{ fontSize: 11, color: 'var(--teL)' }}>В эфире</span>
              </div>
            )}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: 56 }}>{clock}</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

          {/* ── SCHEDULE ── */}
          {tab === 'schedule' && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--pu3)', border: '0.5px solid var(--pu2)', borderRadius: 'var(--r2)', marginBottom: 14 }}>
              <i className="ti ti-calendar-event" aria-hidden="true" style={{ fontSize: 16, color: 'var(--puL)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--puL)' }}>
                  {todayH ? `⭐ Сегодня — ${todayH.name} · ${todayH.start}–${todayH.end}` : `Сегодня — ${DAYS[todayIdx]} · ${todayPlan.start}–${todayPlan.end}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--puL)', opacity: 0.7, marginTop: 1 }}>
                  {activePl?.name || 'Плейлист не выбран'}{todayH ? ' · Праздничный режим' : ''}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{clock}</span>
            </div>

            {/* Week */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <i className="ti ti-calendar-week" aria-hidden="true" style={{ fontSize: 14, color: 'var(--pu)' }} />
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.6px', color: 'var(--text3)' }}>РАБОЧАЯ НЕДЕЛЯ</span>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, color: 'var(--teL)', border: '0.5px solid var(--te2)', background: 'var(--teBg)' }}>{activeW} из 7 · {filledW} с объявлениями</span>
            </div>
            {state.week.map((d, i) => (
              <DayBlock key={i} label={DAYS[i]} data={d} isToday={i === todayIdx}
                playlists={state.playlists} announcements={state.announcements}
                nowTime={i === todayIdx ? clock.slice(0, 5) : undefined}
                warnings={weekConflicts(i)}
                onChange={patch => { const next = [...state.week]; next[i] = { ...d, ...patch } as typeof d; update('week', next) }} />
            ))}

            {/* Holidays */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 10px' }}>
              <i className="ti ti-star" aria-hidden="true" style={{ fontSize: 14, color: 'var(--am)' }} />
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.6px', color: 'var(--text3)' }}>ПРАЗДНИЧНЫЕ ДНИ</span>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, color: activeH ? 'var(--amL)' : 'var(--text3)', border: '0.5px solid', borderColor: activeH ? 'var(--am2)' : 'var(--bd2)', background: activeH ? 'var(--amBg)' : 'var(--bg3)' }}>{state.holidays.length}/40 · {activeH} активны</span>
              <button onClick={() => {
                if (state.holidays.length >= 40) return
                const next = [...state.holidays, { id: 'h' + Date.now(), name: 'Новый праздник', on: false, type: 'single' as const, from: '', to: '', start: '10:00', end: '20:00', fadeOut: 20, playlistId: state.playlists[0]?.id || '', anns: [], open: true }]
                update('holidays', next)
              }} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                <i className="ti ti-plus" aria-hidden="true" /> Добавить праздник
              </button>
            </div>
            {state.holidays.map((h, i) => (
              <DayBlock key={h.id}
                label={h.name + (h.from ? ` · ${h.type === 'range' ? fmtDate(h.from) + '–' + fmtDate(h.to) : fmtDate(h.from)}` : '')}
                data={h} isHoliday
                playlists={state.playlists} announcements={state.announcements}
                warnings={holConflicts(i)}
                onChange={patch => { const next = [...state.holidays]; next[i] = { ...h, ...patch } as typeof h; update('holidays', next) }}
                onDelete={() => { const next = [...state.holidays]; next.splice(i, 1); update('holidays', next) }} />
            ))}
          </>)}

          {/* ── PLAYLISTS ── */}
          {tab === 'playlists' && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <i className="ti ti-music" aria-hidden="true" style={{ fontSize: 14, color: 'var(--pu)' }} />
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.6px', color: 'var(--text3)' }}>ПЛЕЙЛИСТЫ</span>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, border: '0.5px solid var(--bd2)', color: 'var(--text3)', background: 'var(--bg3)' }}>{state.playlists.length}</span>
              <button onClick={() => {
                const name = prompt('Название нового плейлиста:')
                if (name?.trim()) addPlaylist(name.trim())
              }} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 'var(--r)', border: 'none', background: 'var(--pu2)', color: '#EEEDFE', fontSize: 12, cursor: 'pointer' }}>
                <i className="ti ti-plus" aria-hidden="true" /> Создать плейлист
              </button>
            </div>
            {state.playlists.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 13 }}>
                <i className="ti ti-music" aria-hidden="true" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
                Нет плейлистов — нажмите «Создать плейлист»
              </div>
            )}
            {state.playlists.map((pl, i) => {
              const used = plUsedIn(pl.id)
              return (
                <PlaylistEditor key={pl.id} playlist={pl} locked={used.length > 0} lockedIn={used}
                  onChange={patch => { const next = [...state.playlists]; next[i] = { ...pl, ...patch }; update('playlists', next) }}
                  onCopy={() => update('playlists', [...state.playlists, { ...pl, id: 'pl' + Date.now(), name: pl.name + ' (копия)' }])}
                  onDelete={() => { const next = [...state.playlists]; next.splice(i, 1); update('playlists', next) }}
                  onAddFolder={() => addFolderToPlaylist(pl.id)}
                  onAddFiles={() => addFilesToPlaylist(pl.id)} />
              )
            })}
          </>)}

          {/* ── ANNOUNCEMENTS ── */}
          {tab === 'announcements' && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <i className="ti ti-speakerphone" aria-hidden="true" style={{ fontSize: 14, color: 'var(--pu)' }} />
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.6px', color: 'var(--text3)' }}>ОБЪЯВЛЕНИЯ</span>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, border: '0.5px solid var(--bd2)', color: 'var(--text3)', background: 'var(--bg3)' }}>{state.announcements.length}</span>
              <button onClick={() => {
                const name = prompt('Название объявления:')
                if (name?.trim()) addAnnouncement(name.trim())
              }} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 'var(--r)', border: 'none', background: 'var(--pu2)', color: '#EEEDFE', fontSize: 12, cursor: 'pointer' }}>
                <i className="ti ti-plus" aria-hidden="true" /> Добавить объявление
              </button>
            </div>
            {state.announcements.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 13 }}>
                <i className="ti ti-speakerphone" aria-hidden="true" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
                Нет объявлений — нажмите «Добавить объявление» или перетащите MP3
              </div>
            )}
            {state.announcements.map((a, i) => {
              const used = annUsedIn(a.id)
              return (
                <AnnouncementEditor key={a.id} ann={a} locked={used.length > 0} lockedIn={used}
                  onChange={patch => { const next = [...state.announcements]; next[i] = { ...a, ...patch }; update('announcements', next) }}
                  onCopy={() => update('announcements', [...state.announcements, { ...a, id: 'a' + Date.now(), name: a.name + ' (копия)' }])}
                  onDelete={() => { const next = [...state.announcements]; next.splice(i, 1); update('announcements', next) }} />
              )
            })}
          </>)}

          {/* ── PLAYER ── */}
          {tab === 'player' && (<>
            {state.mode === 'studio' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--pu3)', border: '0.5px solid var(--pu2)', borderRadius: 'var(--r2)', marginBottom: 14 }}>
                <i className="ti ti-microscope" aria-hidden="true" style={{ fontSize: 16, color: 'var(--puL)' }} />
                <span style={{ fontSize: 12, color: 'var(--puL)' }}>Режим студии — предпрослушивание, вещание остановлено</span>
              </div>
            )}
            {todayH && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--amBg)', border: '0.5px solid var(--am)', borderRadius: 'var(--r2)', marginBottom: 12 }}>
                <i className="ti ti-star" aria-hidden="true" style={{ color: 'var(--amL)' }} />
                <span style={{ fontSize: 12, color: 'var(--amL)' }}>Сегодня активен праздник «{todayH.name}» — воспроизводится праздничный плейлист</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Режим', val: todayH ? 'Праздник' : 'Рабочий', c: todayH ? 'var(--am)' : 'var(--pu)' },
                { label: 'Плейлист', val: activePl?.name || '—', c: activePl ? COLORS[activePl.color].c : 'var(--text3)' },
                { label: 'Объявлений сегодня', val: String(activePlan?.anns?.length || 0), c: 'var(--text)' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg2)', border: '0.5px solid var(--bd)', borderRadius: 'var(--r2)', padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: s.c }}>{s.val}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--bd)', borderRadius: 'var(--r2)', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: 10, background: 'var(--bg3)', borderRadius: 'var(--r)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: activePl ? COLORS[activePl.color].bg : 'var(--bg4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-music" aria-hidden="true" style={{ fontSize: 18, color: activePl ? COLORS[activePl.color].c : 'var(--text3)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{activePl?.name || '—'} · Track 03</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{activePlan?.start}–{activePlan?.end}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {[false, true, false].map((big, bi) => (
                  <button key={bi} onClick={() => big && setPlaying(p => !p)}
                    style={{ width: big ? 40 : 32, height: big ? 40 : 32, borderRadius: '50%', border: big ? 'none' : '0.5px solid var(--bd2)', background: big ? 'var(--pu2)' : 'var(--bg3)', color: big ? '#fff' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: big ? 17 : 14, cursor: 'pointer' }}>
                    <i className={`ti ${bi === 0 ? 'ti-player-skip-back' : bi === 2 ? 'ti-player-skip-forward' : playing ? 'ti-player-pause' : 'ti-player-play'}`} aria-hidden="true" />
                  </button>
                ))}
                <div style={{ flex: 1 }}>
                  <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 2, cursor: 'pointer' }}
                    onClick={e => { const el = e.currentTarget; const f = e.nativeEvent.offsetX / el.offsetWidth; (el.children[0] as HTMLElement).style.width = Math.round(f * 100) + '%' }}>
                    <div style={{ width: '34%', height: '100%', background: 'var(--pu)', borderRadius: 2 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                    <span>1:23</span><span>4:07</span>
                  </div>
                </div>
                <i className="ti ti-volume" aria-hidden="true" style={{ fontSize: 14, color: 'var(--text3)' }} />
                <input type="range" style={{ width: 70 }} min={0} max={100} defaultValue={75} />
              </div>
              {(activePlan?.anns || []).length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--bd)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Ближайшие объявления</div>
                  {(activePlan?.anns || []).map((a, ai) => {
                    const ann = getAnn(a.annId)
                    return (
                      <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '0.5px solid var(--bd)' }}>
                        <i className="ti ti-clock" aria-hidden="true" style={{ fontSize: 13, color: 'var(--am)' }} />
                        <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{ann?.name || '?'}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--am)' }}>{a.time}</span>
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>муз. {a.vol}%</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>)}

          {/* ── EQ ── */}
          {tab === 'eq' && (
            <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--bd)', borderRadius: 'var(--r2)', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>Пресет:</span>
                {Object.keys(EQ_PRESETS).map(p => (
                  <button key={p} onClick={() => { setEqPreset(p); update('eq', { ...state.eq, bands: [...EQ_PRESETS[p]] }) }}
                    style={{ padding: '4px 10px', borderRadius: 'var(--r)', border: 'none', fontSize: 11, cursor: 'pointer', background: eqPreset === p ? 'var(--pu2)' : 'var(--bg3)', color: eqPreset === p ? '#EEEDFE' : 'var(--text2)' }}>
                    {p}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 4, background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '14px 10px', border: '0.5px solid var(--bd)', marginBottom: 10 }}>
                {state.eq.bands.map((v, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: v > 0 ? 'var(--pu)' : v < 0 ? 'var(--co)' : 'var(--text3)' }}>{v > 0 ? '+' : ''}{v}</span>
                    <input type="range" min={-12} max={12} step={1} value={v}
                      onChange={e => { setEqPreset(''); const b = [...state.eq.bands]; b[i] = +e.target.value; update('eq', { ...state.eq, bands: b }) }}
                      style={{ writingMode: 'vertical-lr', direction: 'rtl', WebkitAppearance: 'slider-vertical', width: 22, height: 88, cursor: 'pointer' } as React.CSSProperties} />
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>{EQ_FREQS[i]}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { label: 'Громкость', min: 0, max: 100, val: state.eq.volume, fmt: (v: number) => v + '%', key: 'volume' as const },
                  { label: 'Баланс', min: -100, max: 100, val: state.eq.balance, fmt: (v: number) => v === 0 ? 'Центр' : v < 0 ? Math.abs(v) + '% Л' : v + '% П', key: 'balance' as const },
                ].map(k => (
                  <div key={k.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 64 }}>{k.label}</span>
                    <input type="range" min={k.min} max={k.max} step={1} value={k.val} style={{ flex: 1 }}
                      onChange={e => update('eq', { ...state.eq, [k.key]: +e.target.value })} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', minWidth: 48, textAlign: 'right' }}>{k.fmt(k.val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    </div>
  )
}
