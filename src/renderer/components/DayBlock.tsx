import React, { useRef } from 'react'
import { DaySchedule, Holiday, Playlist, Announcement, ScheduledAnn, COLORS, timeToFrac, fracToTime } from '../types'
import s from './DayBlock.module.css'

interface Props {
  label: string
  data: DaySchedule | Holiday
  isToday?: boolean
  isHoliday?: boolean
  playlists: Playlist[]
  announcements: Announcement[]
  nowTime?: string   // "HH:MM" — shows playhead if today
  onChange: (patch: Partial<DaySchedule & Holiday>) => void
  onDelete?: () => void
  warnings?: string[]
}

export default function DayBlock({ label, data, isToday, isHoliday, playlists, announcements, nowTime, onChange, onDelete, warnings }: Props) {
  const d = data as DaySchedule & Holiday
  const sh = parseInt(d.start), eh = parseInt(d.end), totalH = eh - sh
  const pl = playlists.find(p => p.id === d.playlistId)
  const clr = pl ? COLORS[pl.color] : null
  const annTrackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<{ ai: number } | null>(null)

  function pct(v: number) { return (v * 100).toFixed(1) + '%' }
  function timeToH(t: string) { const [h, m] = t.split(':').map(Number); return h + m / 60 }

  function dropAnn(e: React.DragEvent) {
    e.preventDefault()
    if (!annTrackRef.current) return
    const rect = annTrackRef.current.getBoundingClientRect()
    const frac = Math.max(0, Math.min(0.95, (e.clientX - rect.left) / rect.width))
    const t = fracToTime(frac, sh, totalH)
    if (dragging.current) {
      const next = [...d.anns]
      next[dragging.current.ai] = { ...next[dragging.current.ai], time: t }
      onChange({ anns: next })
      dragging.current = null
    }
  }

  // Conflict: ann without playlist
  const hasConflict = d.anns.length > 0 && !d.playlistId

  return (
    <div className={[s.block, isToday ? s.today : '', isHoliday ? s.holiday : '', d.on ? '' : s.off].join(' ')}>
      {/* Header */}
      <div className={s.header} onClick={() => onChange({ open: !d.open } as Partial<DaySchedule>)}>
        <div
          className={[s.tog, d.on ? (isHoliday ? s.togAmber : s.togOn) : ''].join(' ')}
          onClick={e => { e.stopPropagation(); onChange({ on: !d.on } as Partial<DaySchedule>) }}
          title="Вкл/выкл"
        />
        <span className={s.label}>{label}</span>
        <div className={s.meta}>
          {d.on ? <>
            <span className={s.tChip}>{d.start}–{d.end}</span>
            {pl && <span className={s.plChip} style={{ color: clr!.c, borderColor: clr!.c + '44', background: clr!.bg }}>
              <span className={s.dot} style={{ background: clr!.c }} />{pl.name}
            </span>}
            {!d.playlistId && <span className={s.warn}>нет плейлиста</span>}
          </> : <span className={s.dim}>Выходной / неактивен</span>}
        </div>
        {d.anns.length > 0 && <div className={s.annDots}>{d.anns.map((_, i) => <div key={i} className={s.annDot} />)}</div>}
        {isToday && <span className={s.todayBadge}>Сегодня</span>}
        {hasConflict && <span className={s.warnBadge}>⚠ нет плейлиста</span>}
        <i className={['ti ti-chevron-down', s.chv, d.open ? s.chvOpen : ''].join(' ')} aria-hidden="true" />
      </div>

      {d.open && (
        <div className={s.body}>
          {/* Warnings */}
          {warnings?.map((w, i) => (
            <div key={i} className={s.conflictRow}>
              <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: 'var(--co)', fontSize: 13 }} />
              <span>{w}</span>
            </div>
          ))}

          {/* Hours */}
          <div className={s.row}>
            <span className={s.rl}><i className="ti ti-clock" aria-hidden="true" />Часы работы</span>
            <input className={s.ti} type="time" value={d.start} onChange={e => onChange({ start: e.target.value } as Partial<DaySchedule>)} />
            <span className={s.sep}>—</span>
            <input className={s.ti} type="time" value={d.end} onChange={e => onChange({ end: e.target.value } as Partial<DaySchedule>)} />
            <div className={s.rowRight}>
              <div className={[s.tog, d.on ? (isHoliday ? s.togAmber : s.togOn) : ''].join(' ')}
                onClick={() => onChange({ on: !d.on } as Partial<DaySchedule>)} />
              <span className={s.dim}>{d.on ? 'Активен' : 'Выходной'}</span>
            </div>
          </div>

          {/* Fade out */}
          <div className={s.row}>
            <span className={s.rl}><i className="ti ti-sunset" aria-hidden="true" />Конец дня</span>
            <span className={s.dim} style={{ fontSize: 11 }}>Плавное затухание:</span>
            {[10, 20, 30].map(sec => (
              <button key={sec} className={[s.secBtn, d.fadeOut === sec ? s.secActive : ''].join(' ')}
                onClick={() => onChange({ fadeOut: sec } as Partial<DaySchedule>)}>{sec} сек</button>
            ))}
          </div>

          {/* Playlist */}
          <div className={s.row}>
            <span className={s.rl}><i className="ti ti-music" aria-hidden="true" />Плейлист</span>
            <div className={s.plGrid}>
              {playlists.length === 0 && <span className={s.dim}>Нет плейлистов — добавьте в разделе «Плейлисты»</span>}
              {playlists.map(p => {
                const cc = COLORS[p.color]
                const active = d.playlistId === p.id
                return (
                  <span key={p.id} className={s.plChip}
                    style={{ cursor: 'pointer', color: cc.c, borderColor: active ? cc.c : 'var(--bd2)', background: active ? cc.bg : 'var(--bg3)' }}
                    onClick={() => onChange({ playlistId: p.id } as Partial<DaySchedule>)}>
                    <span className={s.dot} style={{ background: cc.c }} />{p.name}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Timeline */}
          <div className={s.row} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={s.rl}><i className="ti ti-speakerphone" aria-hidden="true" />Шкала дня</span>
              <div className={s.tlWrap}>
                {/* Ruler */}
                <div className={s.ruler}>
                  {Array.from({ length: Math.floor(totalH / 2) + 1 }, (_, i) => sh + i * 2).map(h => (
                    <span key={h} className={s.tick} style={{ left: pct((h - sh) / totalH) }}>{h}:00</span>
                  ))}
                </div>
                {/* BG track */}
                <div className={s.track}>
                  <div className={s.tlLabel}><i className="ti ti-music" aria-hidden="true" />Фон</div>
                  <div className={s.tlArea}>
                    {pl && <div className={s.tlFill} style={{ left: 0, right: 0, background: clr!.bg, color: clr!.c }}>{pl.name}</div>}
                    {nowTime && d.on && (
                      <div className={s.nowLine} style={{ left: pct(timeToFrac(nowTime, sh, totalH)) }}>
                        <div className={s.nowDot} />
                        <div className={s.nowLabel}>{nowTime}</div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Ann track */}
                <div className={s.track}>
                  <div className={s.tlLabel}><i className="ti ti-speakerphone" aria-hidden="true" />Объявл.</div>
                  <div className={s.tlArea} ref={annTrackRef}
                    onDragOver={e => { e.preventDefault(); annTrackRef.current!.style.outline = '1px dashed var(--pu)' }}
                    onDragLeave={() => { annTrackRef.current!.style.outline = '' }}
                    onDrop={dropAnn}>
                    {d.anns.map((a, ai) => {
                      const ann = announcements.find(x => x.id === a.annId)
                      const frac = timeToFrac(a.time, sh, totalH)
                      return (
                        <div key={ai} className={s.annBl}
                          style={{ left: pct(frac), width: 82 }}
                          draggable
                          onDragStart={() => { dragging.current = { ai } }}
                          onDoubleClick={() => { const next = [...d.anns]; next.splice(ai, 1); onChange({ anns: next }) }}
                          title={`${ann?.name || '?'} · ${a.time} · двойной клик — удалить`}>
                          <span className={s.annTime}>{a.time}</span>
                          <i className="ti ti-speakerphone" aria-hidden="true" style={{ fontSize: 9, flexShrink: 0 }} />
                          {ann?.name || '?'}
                        </div>
                      )
                    })}
                    {d.anns.length === 0 && (
                      <div className={s.dropHint}>Перетащите объявление сюда</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Ann list */}
            <div style={{ paddingLeft: 84 }}>
              {d.anns.map((a, ai) => {
                const ann = announcements.find(x => x.id === a.annId)
                return (
                  <div key={ai} className={s.annRow}>
                    <i className="ti ti-speakerphone" aria-hidden="true" style={{ color: 'var(--pu)', fontSize: 13 }} />
                    <select className={s.sel} value={a.annId}
                      onChange={e => { const next = [...d.anns]; next[ai] = { ...a, annId: e.target.value }; onChange({ anns: next }) }}>
                      {announcements.map(an => <option key={an.id} value={an.id}>{an.name} ({an.dur})</option>)}
                    </select>
                    <input className={s.annTi} type="time" value={a.time}
                      onChange={e => { const next = [...d.anns]; next[ai] = { ...a, time: e.target.value }; onChange({ anns: next }) }}
                      title="Точное время начала объявления" />
                    <i className="ti ti-volume" aria-hidden="true" style={{ color: 'var(--text3)', fontSize: 12 }} />
                    <input type="range" style={{ width: 64 }} min={5} max={60} step={5} value={a.vol}
                      onChange={e => { const next = [...d.anns]; next[ai] = { ...a, vol: +e.target.value }; onChange({ anns: next }) }} />
                    <span className={s.vv}>{a.vol}%</span>
                    <button className={s.delBtn} onClick={() => { const next = [...d.anns]; next.splice(ai, 1); onChange({ anns: next }) }}>
                      <i className="ti ti-x" aria-hidden="true" />
                    </button>
                  </div>
                )
              })}
              <button className={s.addAnnBtn} onClick={() => {
                if (announcements.length === 0) return
                onChange({ anns: [...d.anns, { annId: announcements[0].id, time: '12:00', vol: 20 }] })
              }}>
                <i className="ti ti-plus" aria-hidden="true" /> Добавить объявление
              </button>
            </div>
          </div>

          {/* Holiday: date */}
          {isHoliday && (
            <>
              <div className={s.row}>
                <span className={s.rl}><i className="ti ti-calendar" aria-hidden="true" />Тип даты</span>
                <select className={s.sel} value={d.type} onChange={e => onChange({ type: e.target.value as 'single' | 'range' })}>
                  <option value="single">Один день</option>
                  <option value="range">Период (с — по)</option>
                </select>
              </div>
              <div className={s.row}>
                <span className={s.rl}><i className="ti ti-calendar-event" aria-hidden="true" />{d.type === 'range' ? 'С' : 'Дата'}</span>
                <input className={s.di} type="date" value={d.from} onChange={e => onChange({ from: e.target.value })} />
                {d.type === 'range' && <>
                  <span className={s.sep}>по</span>
                  <input className={s.di} type="date" value={d.to} onChange={e => onChange({ to: e.target.value })} />
                </>}
              </div>
            </>
          )}

          {/* Delete holiday */}
          {isHoliday && onDelete && (
            <div className={s.row} style={{ justifyContent: 'flex-end', paddingTop: 4 }}>
              <button className={s.dangerBtn} onClick={onDelete}>
                <i className="ti ti-trash" aria-hidden="true" /> Удалить праздник
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
