const T = require('../dist-electron/shared/time.js');
const S = require('../dist-electron/shared/selectors.js');
const St = require('../dist-electron/shared/store.js');
const { hhmm, ddmm } = T;

let pass=0, fail=0;
const eq=(name,got,exp)=>{ const ok=JSON.stringify(got)===JSON.stringify(exp);
  if(ok)pass++; else {fail++; console.log(`  ✗ ${name}: получено ${JSON.stringify(got)}, ожидалось ${JSON.stringify(exp)}`);} };

// ── time.ts
eq('hhmmToMin 09:00', T.hhmmToMin(hhmm('09:00')), 540);
eq('minToHHMM 540', T.minToHHMM(540), '09:00');
eq('round-trip 23:45', T.minToHHMM(T.hhmmToMin(hhmm('23:45'))), '23:45');
eq('addMinutes wrap 23:30+60', T.addMinutes(hhmm('23:30'),60), '00:30');
eq('addMinutes 09:00+90', T.addMinutes(hhmm('09:00'),90), '10:30');
eq('isOvernight 22→02', T.isOvernight(hhmm('22:00'),hhmm('02:00')), true);
eq('isOvernight 09→22', T.isOvernight(hhmm('09:00'),hhmm('22:00')), false);
eq('span 09→22', T.spanMinutes(hhmm('09:00'),hhmm('22:00')), 780);
eq('span overnight 22→02', T.spanMinutes(hhmm('22:00'),hhmm('02:00')), 240);
eq('offset 09:00→10:00', T.offsetFromDayStart(hhmm('09:00'),hhmm('10:00')), 60);
eq('offset overnight 22:00→01:00', T.offsetFromDayStart(hhmm('22:00'),hhmm('01:00')), 180);
eq('fmtDuration 212', T.fmtDuration(212), '3:32');
eq('fmtDuration 60', T.fmtDuration(60), '1:00');
eq('ordinalOfDate=ddmm 01.01', T.ordinalOfDate(new Date(2025,0,1)), T.ddmmToOrdinal(ddmm('01.01')));
eq('ddmmToOrdinal 31.12 (Feb=29)', T.ddmmToOrdinal(ddmm('31.12')), 366);

// ── store.ts
const store = St.createDefaultStore();
eq('week 7 дней', Object.keys(store.week).length, 7);
eq('пн 09:00', store.week.mon.start, '09:00');
eq('пн 22:00', store.week.mon.end, '22:00');
eq('сб 10:00', store.week.sat.start, '10:00');
eq('сб 23:00', store.week.sat.end, '23:00');
eq('audio.volume 80', store.audio.volume, 80);
eq('holidays пусто', store.holidays.length, 0);

// ── selectors.ts: математика плейлиста
const audio = store.audio; // fadeOverlap=5
const pl = { id:'p1', name:'x', color:'green', crossfade:true,
  tracks:[{id:'t1',name:'a',durationSec:100,file:'a'},{id:'t2',name:'b',durationSec:100,file:'b'}] };
eq('plEffectiveSec crossfade', S.playlistEffectiveSec(pl, audio), 195);
eq('plEffectiveSec no-crossfade', S.playlistEffectiveSec({...pl,crossfade:false}, audio), 200);
eq('plBlockEnd 09:00 → 09:03', S.playlistBlockEnd(hhmm('09:00'), pl, audio), '09:03');

// ── selectors.ts: праздники
const annual = { id:'h1', name:'8 Марта', from:ddmm('08.03'), to:null, start:hhmm('09:00'), end:hhmm('21:00'), off:false, blocks:[] };
const pinned = { id:'h2', name:'Распродажа 2026', from:ddmm('08.03'), to:null, year:2026, start:hhmm('10:00'), end:hhmm('20:00'), off:false, blocks:[] };
eq('annual matches любой год', S.activeHolidayFor([annual], new Date(2030,2,8))?.id, 'h1');
eq('pinned НЕ matches др. год', S.activeHolidayFor([pinned], new Date(2027,2,8)), null);
eq('pinned приоритет над annual', S.activeHolidayFor([annual,pinned], new Date(2026,2,8))?.id, 'h2');

// ── selectors.ts: активное окно
const monday = new Date(2025,0,6,12,0);   // Пн
eq('resolve будний → day/mon', (()=>{const w=S.resolveActiveWindow(store,monday);return [w.kind,w.id,w.carriedOver];})(), ['day','mon',false]);

const sHol = St.createDefaultStore(); sHol.holidays=[{ id:'hX', name:'Тест', from:ddmm('06.01'), to:null, start:hhmm('10:00'), end:hhmm('18:00'), off:false, blocks:[] }];
eq('праздник перекрывает день', S.resolveActiveWindow(sHol, monday).kind, 'holiday');

const sOv = St.createDefaultStore(); sOv.week.sat.end = hhmm('02:00'); // сб овернайт 10:00→02:00
const sun0100 = new Date(2025,0,12,1,0);   // Вс 01:00 (вчера — сб)
eq('овернайт-хвост: вс 01:00 → sat/carried', (()=>{const w=S.resolveActiveWindow(sOv,sun0100);return [w.kind,w.id,w.carriedOver];})(), ['day','sat',true]);
const sun0300 = new Date(2025,0,12,3,0);   // Вс 03:00 — хвост уже кончился
eq('после хвоста: вс 03:00 → sun', (()=>{const w=S.resolveActiveWindow(sOv,sun0300);return [w.id,w.carriedOver];})(), ['sun',false]);

console.log(`\n${'='.repeat(40)}\nИТОГ: ${pass} прошло, ${fail} упало (всего ${pass+fail})`);
process.exit(fail?1:0);
