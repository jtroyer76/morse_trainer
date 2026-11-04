'use strict';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const KOCH = 'KMRSUAPTLOWI.NJEF0Y,VG5/Q9ZH38B?427C1D6X'.split('');
const MORSE = {
  A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',
  K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',
  U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',
  '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....',
  '6':'-....','7':'--...','8':'---..','9':'----.',
  '.':'.-.-.-',',':'--..--','?':'..--..','/':'-..-.',
};
const HISTORY_LEN = 20;        // trials kept per character
const MIN_TRIALS = 10;         // before a character counts toward promotion
const PROMOTE_ACC = 0.9;
const PROMOTE_RT_MARGIN = 150; // ms above floor still counts as ICR

const DEFAULTS = {
  level: 2, wpm: 25, tone: 650, timeout: 2500, gap: 600, session: 60,
  warmup: 10, focus: false, focusCount: 10, focusDecoys: 3, layout: 'qwerty', showAnswer: true, soundFeedback: true, punctuation: true,
};

const settings = Object.assign({}, DEFAULTS, load('icr.settings', {}));
let stats = load('icr.stats', {});   // char -> [{rt, ok, t}]

function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------
let ctx = null;
function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Schedule a character. Returns the performance.now() timestamp of the end of its last element.
function playChar(ch) {
  const ac = audio();
  const dit = 1.2 / settings.wpm;
  const ramp = 0.004;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = settings.tone;
  g.gain.value = 0;
  osc.connect(g).connect(ac.destination);

  let t = ac.currentTime + 0.05;
  const start = t;
  for (const el of MORSE[ch]) {
    const len = (el === '.' ? 1 : 3) * dit;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + ramp);
    g.gain.setValueAtTime(0.5, t + len - ramp);
    g.gain.linearRampToValueAtTime(0, t + len);
    t += len + dit;
  }
  const end = t - dit;     // end of the last element, before the trailing gap
  osc.start(start);
  osc.stop(end + 0.01);
  return performance.now() + (end - ac.currentTime) * 1000;
}

function buzz() {
  if (!settings.soundFeedback) return;
  const ac = audio();
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.type = 'square'; osc.frequency.value = 150;
  g.gain.value = 0.08;
  osc.connect(g).connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.12);
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------
function trials(ch) { return stats[ch] || []; }
function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function charSummary(ch) {
  const t = trials(ch);
  const ok = t.filter(x => x.ok);
  return {
    n: t.length,
    acc: t.length ? ok.length / t.length : null,
    rt: median(ok.map(x => x.rt)),
  };
}
const PUNCT = new Set(['.', ',', '?', '/']);
function activeChars() {
  return KOCH.slice(0, settings.level).filter(c => settings.punctuation || !PUNCT.has(c));
}
function floorRT() {
  const rts = activeChars().map(charSummary).filter(s => s.n >= 5 && s.rt != null).map(s => s.rt);
  return rts.length ? Math.min.apply(null, rts) : null;
}
function record(ch, rt, ok) {
  const t = trials(ch);
  t.push({ rt: Math.round(rt), ok: ok, t: Date.now() });
  if (t.length > HISTORY_LEN) t.splice(0, t.length - HISTORY_LEN);
  stats[ch] = t;
  save('icr.stats', stats);
}

// Two phases. Warm-up: every character gets an even number of trials, chosen at random
// among the least-practised ones. After that: random, weighted toward slow and missed
// characters. Never the same character twice in a row.
// Focus mode: the weakest characters (by gap above the floor, plus misses) with a few
// strong ones mixed in as decoys so the answer cannot be guessed from the short list.
function focusPool() {
  const floor = floorRT() || 0;
  const scored = activeChars().map(c => {
    const s = charSummary(c);
    const gap = s.rt != null ? s.rt - floor : 600;       // unseen counts as weak
    const miss = s.acc != null ? (1 - s.acc) * 1000 : 0;
    return { c: c, score: gap + miss };
  }).sort((a, b) => b.score - a.score);
  const weak = scored.slice(0, settings.focusCount).map(x => x.c);
  const strong = scored.slice(settings.focusCount).map(x => x.c);
  for (let i = strong.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [strong[i], strong[j]] = [strong[j], strong[i]]; }
  return weak.concat(strong.slice(0, settings.focusDecoys));
}
function pickChar(prev) {
  if (settings.focus) {
    const fp = focusPool().filter(c => c !== prev);
    return fp[Math.floor(Math.random() * fp.length)];   // even random across the weak set + decoys
  }
  const pool = activeChars().filter(c => c !== prev);
  const counts = pool.map(c => trials(c).length);
  const minCount = Math.min.apply(null, counts);
  if (minCount < settings.warmup) {
    const least = pool.filter((c, i) => counts[i] === minCount);
    return least[Math.floor(Math.random() * least.length)];
  }
  const floor = floorRT();
  const weights = pool.map(c => {
    const s = charSummary(c);
    let w = 1;
    if (s.acc != null) w += 4 * (1 - s.acc);                                   // errors
    if (floor != null && s.rt != null) w += Math.min(3, Math.max(0, (s.rt - floor) / 300)); // slowness
    const last = trials(c).slice(-1)[0];
    if (last && !last.ok) w += 2;                                              // just missed it
    return w;
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

function promotionReady() {
  if (settings.level >= KOCH.length) return false;
  const floor = floorRT();
  if (floor == null) return false;
  return activeChars().every(c => {
    const s = charSummary(c);
    return s.n >= MIN_TRIALS && s.acc >= PROMOTE_ACC && s.rt != null && s.rt - floor <= PROMOTE_RT_MARGIN;
  }) && KOCH.slice(settings.level).some(c => settings.punctuation || !PUNCT.has(c));
}

// ---------------------------------------------------------------------------
// Drill state machine
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const drill = { running: false, current: null, endAt: 0, awaiting: false, timer: null, count: 0, ok: 0, rts: [] };

function startSession() {
  audio();
  Object.assign(drill, { running: true, current: null, count: 0, ok: 0, rts: [] });
  $('btn-start').disabled = true; $('btn-stop').disabled = false;
  updateStatus();
  setTimeout(nextChar, 300);
}
function stopSession() {
  drill.running = false; drill.awaiting = false;
  clearTimeout(drill.timer);
  $('btn-start').disabled = false; $('btn-stop').disabled = true; $('btn-replay').disabled = true;
  $('prompt-main').textContent = drill.count ? 'Done' : 'Tap Start';
  $('prompt-main').className = '';
  showPromote();
}
function nextChar() {
  if (!drill.running) return;
  if (drill.count >= settings.session) return stopSession();
  drill.current = pickChar(drill.current);
  $('prompt-main').textContent = '·';
  $('prompt-main').className = '';
  $('btn-replay').disabled = true;
  drill.endAt = playChar(drill.current);
  drill.awaiting = true;
  const wait = drill.endAt - performance.now() + settings.timeout;
  drill.timer = setTimeout(() => answer(null), wait);
}
function answer(ch) {
  if (!drill.awaiting) return;
  drill.awaiting = false;
  clearTimeout(drill.timer);
  const rt = performance.now() - drill.endAt;
  const ok = ch === drill.current;
  record(drill.current, ok ? rt : settings.timeout, ok);
  drill.count++; if (ok) { drill.ok++; drill.rts.push(rt); }

  const main = $('prompt-main');
  if (ok) {
    main.textContent = drill.current; main.className = 'good';
    flashKey(ch, 'flash-good');
  } else {
    main.textContent = settings.showAnswer ? drill.current : (ch === null ? '⏱' : '✗');
    main.className = 'bad';
    if (ch) flashKey(ch, 'flash-bad');
    flashKey(drill.current, 'flash-good');
    buzz();
  }
  $('btn-replay').disabled = false;
  updateStatus(); updateFocusTag();
  drill.timer = setTimeout(nextChar, settings.gap + (ok ? 0 : 400));
}
function replay() {
  if (!drill.running || drill.awaiting || !drill.current) return;
  clearTimeout(drill.timer);
  playChar(drill.current);
  drill.timer = setTimeout(nextChar, settings.gap + 800);
}
function flashKey(ch, cls) {
  const b = document.querySelector('#keypad button[data-ch="' + CSS.escape(ch) + '"]');
  if (!b) return;
  b.classList.add(cls); setTimeout(() => b.classList.remove(cls), 250);
}
function updateStatus() {
  $('session-progress').textContent = drill.count + ' / ' + settings.session;
  $('session-acc').textContent = drill.count ? Math.round(100 * drill.ok / drill.count) + '%' : '—';
  const m = median(drill.rts);
  $('session-rt').textContent = m != null ? Math.round(m) + ' ms' : '—';
}
function warmupRemaining() {
  return activeChars().reduce((n, c) => n + Math.max(0, settings.warmup - trials(c).length), 0);
}
function updateFocusTag() {
  const left = warmupRemaining();
  const box = $('set-focus');
  if (left > 0) {
    if (settings.focus) { settings.focus = false; save('icr.settings', settings); box.checked = false; }
    box.disabled = true;
    $('focus-note').textContent = '(available after warm-up, ' + left + ' trials to go)';
  } else {
    box.disabled = false;
    $('focus-note').textContent = '';
  }
  $('focus-tag').classList.toggle('hidden', !settings.focus);
}
function showPromote() {
  const box = $('promote');
  if (promotionReady()) {
    $('promote-text').textContent = 'All ' + settings.level + ' characters look solid. Next: ' + KOCH[settings.level];
    box.classList.remove('hidden');
  } else box.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const QWERTY_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM', '.,?/'];
function keypadRows() {
  if (settings.layout === 'qwerty') return QWERTY_ROWS.map(r => r.split(''));
  const rows = []; for (let i = 0; i < KOCH.length; i += 7) rows.push(KOCH.slice(i, i + 7));
  return rows;
}
function buildKeypad() {
  const pad = $('keypad');
  pad.innerHTML = '';
  pad.className = 'keypad ' + settings.layout;
  // Fixed layout: the full set in a stable position, inactive keys dimmed, so the motor
  // cost of each key stays constant as the level grows.
  const active = new Set(activeChars());
  for (const row of keypadRows()) {
    const keys = row.filter(ch => settings.punctuation || !PUNCT.has(ch));
    if (!keys.length) continue;
    const div = document.createElement('div');
    div.className = 'row';
    for (const ch of keys) {
      const b = document.createElement('button');
      b.textContent = ch; b.dataset.ch = ch;
      b.disabled = !active.has(ch);
      b.addEventListener('pointerdown', e => { e.preventDefault(); answer(ch); });
      div.appendChild(b);
    }
    pad.appendChild(div);
  }
  $('level-label').textContent = settings.level;
}
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toUpperCase();
  if (k === ' ' && !drill.running) { e.preventDefault(); return startSession(); }
  if (k === 'ESCAPE') return stopSession();
  if (k === 'ENTER') return replay();
  if (MORSE[k] && activeChars().indexOf(k) >= 0) answer(k);
});

function renderStats() {
  const tb = document.querySelector('#stats-table tbody');
  tb.innerHTML = '';
  const floor = floorRT();
  const rows = activeChars().map(c => Object.assign({ c: c }, charSummary(c)));
  const maxRt = Math.max.apply(null, [1].concat(rows.map(r => r.rt || 0)));
  for (const r of rows) {
    const tr = document.createElement('tr');
    const d = (floor != null && r.rt != null) ? r.rt - floor : null;
    const accCls = r.acc == null ? '' : r.acc >= PROMOTE_ACC ? 'good' : r.acc >= 0.7 ? 'warn' : 'bad';
    const dCls = d == null ? '' : d <= PROMOTE_RT_MARGIN ? 'good' : d <= 400 ? 'warn' : 'bad';
    const cells = [
      '<td>' + r.c + '</td>',
      '<td>' + r.n + '</td>',
      '<td class="' + accCls + '">' + (r.acc == null ? '—' : Math.round(100 * r.acc) + '%') + '</td>',
      '<td>' + (r.rt == null ? '—' : Math.round(r.rt) + ' ms') + '</td>',
      '<td class="' + dCls + '">' + (d == null ? '—' : '+' + Math.round(d)) + '</td>',
      '<td style="width:30%"><span class="bar" style="width:' + (r.rt ? 100 * r.rt / maxRt : 0) + '%"></span></td>',
    ];
    tr.innerHTML = cells.join('');
    tb.appendChild(tr);
  }
}

function bindSetting(id, key) {
  const el = $('set-' + id), out = $('set-' + id + '-out');
  el.value = settings[key]; out.textContent = settings[key];
  el.addEventListener('input', () => {
    settings[key] = Number(el.value); out.textContent = settings[key];
    save('icr.settings', settings);
    if (key === 'level') { buildKeypad(); showPromote(); }
    if (key === 'level' || key === 'warmup') updateFocusTag();
  });
}
function bindCheck(id, key) {
  const el = $('set-' + id);
  el.checked = settings[key];
  el.addEventListener('change', () => {
    settings[key] = el.checked; save('icr.settings', settings);
    if (key === 'punctuation') { buildKeypad(); showPromote(); updateFocusTag(); }
    if (key === 'focus') updateFocusTag();
  });
}

function init() {
  buildKeypad();
  bindSetting('level', 'level'); bindSetting('wpm', 'wpm'); bindSetting('tone', 'tone');
  bindSetting('timeout', 'timeout'); bindSetting('warmup', 'warmup'); bindSetting('gap', 'gap'); bindSetting('session', 'session');
  $('set-layout').value = settings.layout;
  $('set-layout').addEventListener('change', () => { settings.layout = $('set-layout').value; save('icr.settings', settings); buildKeypad(); });
  bindCheck('showanswer', 'showAnswer'); bindCheck('sound', 'soundFeedback'); bindCheck('punct', 'punctuation'); bindCheck('focus', 'focus'); bindSetting('focuscount', 'focusCount'); bindSetting('focusdecoys', 'focusDecoys');
  $('koch-order').textContent = KOCH.join(' ');

  $('btn-start').addEventListener('click', startSession);
  $('btn-stop').addEventListener('click', stopSession);
  $('btn-replay').addEventListener('click', replay);
  $('btn-promote').addEventListener('click', () => {
    settings.level = Math.min(KOCH.length, settings.level + 1);
    save('icr.settings', settings);
    $('set-level').value = settings.level; $('set-level-out').textContent = settings.level;
    buildKeypad(); showPromote();
  });
  $('btn-all').addEventListener('click', () => {
    settings.level = KOCH.length;
    save('icr.settings', settings);
    $('set-level').value = settings.level; $('set-level-out').textContent = settings.level;
    buildKeypad(); showPromote();
  });
  $('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ settings: settings, stats: stats }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'icr-stats.json'; a.click();
  });
  $('btn-reset').addEventListener('click', () => {
    if (confirm('Erase all character stats?')) { stats = {}; save('icr.stats', stats); renderStats(); showPromote(); updateFocusTag(); }
  });

  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
    if (b.dataset.view === 'stats') renderStats();
  }));
  showPromote(); updateFocusTag();
}
init();
