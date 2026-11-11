// 60-second Orb Hunt rounds for the Babylon demo, kept in Hawkes Net shared state (host-authoritative).
//
// The host owns the round: sync.state('round') carries { n, phase: 'play' | 'result', left (ms in this phase), len, result }.
// Clients count down from the `left` they last received (no wall-clock agreement needed), so every screen shows the same
// timer to within a send tick. At 0 the host freezes scoring, writes ONE result (winner text + sorted board) into the
// state, and every client paints that same card with confetti for 3 s; then the host resets scores and starts the next round.
// A visitor who has been alone for 3 s gets two bots, simulated by the host (sync.state('bots')): each walks to the nearest
// orb, steers round props, and collects through the same award path a touch uses. They leave the moment a real player joins.
// No timers fetch the service: everything rides the host's render loop and the SDK's own state sync.

export const ROUND_SECONDS = 60;
export const RESULT_MS = 3000;
export const ALONE_MS = 3000;
export const PULSE_S = 10;
export const BOT_NAMES = ['Bot Ada', 'Bot Kit'];
const BOT_SPEED = 3.4;       // units/s: a touch slower than a player (5)
const BOT_REACH = 0.95;      // collect when this close (orb TOUCH_R is 1.15)
const ARENA = 14;
const CONFETTI_N = 150;
const COLORS = ['#7fe8ff', '#9fe870', '#ffd23f', '#ff7b72', '#c792ea', '#ffffff'];

function asRoom(net) {
  if (!net) return null;
  if (net.sync && typeof net.sync.state === 'function') return net;
  if (net.room?.sync) return net.room;
  return null;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = (v) => Math.round(v * 100) / 100;
export const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * @param {object} o
 * @param {*} o.BABYLON
 * @param {*} o.scene
 * @param {ReturnType<import('./orbs.mjs').createOrbs>} o.orbs
 * @param {number} [o.seconds] round length (the page's ?round= option; default 60)
 * @param {{ timer?: HTMLElement, result?: HTMLElement, confetti?: HTMLCanvasElement }} [o.ui]
 * @param {(id: string, name: string) => any} [o.makeBot] returns the node that stands for a bot in the scene
 */
export function createRounds(o) {
  const orbs = o.orbs, ui = o.ui || {};
  const makeBot = o.makeBot || null;
  let lenMs = Math.round(Math.min(600, Math.max(5, Number(o.seconds) || ROUND_SECONDS)) * 1000);
  const games = new Map();      // Room -> mirror
  const views = new Map();      // bot id -> { root, x, z } (page only)
  let mainRoom = null, mainNet = null;
  let lastTick = 0, lastTimer = '', lastCard = '', shownN = -1;
  let confetti = [];

  const remaining = (g, now) => Math.max(0, g.round.left - (now - g.round.at));

  function nameOf(net, g, id) {
    if (id === (net?.id ?? asRoom(net)?.id)) return net?.name || asRoom(net)?.name || 'You';
    const b = g.bots.find((x) => x.id === id);
    if (b) return b.name;
    const p = (net?.peers || asRoom(net)?.peers)?.get(id);
    return String(p?.name || id).slice(0, 18);
  }

  /** Everyone in the room plus anyone who has a score, sorted: high score first, then name, then id (stable). */
  function board(net, g, scores, nameFor = (id) => nameOf(net, g, id)) {
    const room = asRoom(net);
    const ids = new Set([net?.id ?? room?.id, ...(room?.peers ? room.peers.keys() : []), ...g.bots.map((b) => b.id), ...Object.keys(scores || {})].filter(Boolean));
    return [...ids].map((id) => ({ id, name: nameFor(id), score: scores?.[id] || 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
  }

  function wire(net) {
    const room = asRoom(net);
    if (!room) return null;
    if (games.has(room)) return games.get(room);
    const g = {
      net, room, bots: [], aloneSince: null,
      round: { n: 0, phase: 'play', left: lenMs, len: lenMs, at: performance.now(), result: null },
    };
    games.set(room, g);

    room.sync.state('round', {
      get: () => ({ n: g.round.n, phase: g.round.phase, left: Math.round(remaining(g, performance.now())), len: g.round.len, result: g.round.result }),
      set: (s) => {
        if (!s || typeof s !== 'object') return;
        const r = g.round;
        if (Number.isFinite(s.n)) r.n = s.n;
        if (s.phase === 'play' || s.phase === 'result') r.phase = s.phase;
        if (Number.isFinite(s.len)) r.len = s.len;
        if (s.result !== undefined) r.result = s.result;
        if (Number.isFinite(s.left)) { r.left = s.left; r.at = performance.now(); }
      },
      rate: 4,
    });
    room.sync.state('bots', {
      get: () => ({ bots: g.bots.map((b) => ({ id: b.id, name: b.name, x: r2(b.x), z: r2(b.z) })) }),
      set: (s) => {
        if (s && Array.isArray(s.bots)) g.bots = s.bots.map((b) => ({ id: String(b.id), name: String(b.name), x: +b.x, z: +b.z }));
      },
      rate: 10,
    });
    return g;
  }

  // ---- host: the round ----
  function startRound(g, now) {
    const r = g.round;
    r.n += 1; r.phase = 'play'; r.len = lenMs; r.left = lenMs; r.at = now; r.result = null;
    orbs.resetScores(g.net);
    orbs.setFrozen(g.net, false);
  }

  function endRound(g, now) {
    const scores = orbs.snapshot(g.net).scores;
    const rows = board(g.net, g, scores);
    const top = rows.length ? rows[0].score : 0;
    const winners = top > 0 ? rows.filter((x) => x.score === top) : [];
    const text = !winners.length ? 'Nobody scored: a draw'
      : winners.length === 1 ? `${winners[0].name} wins!`
        : `${winners.map((w) => w.name).join(' & ')} tie!`;
    const r = g.round;
    r.phase = 'result'; r.left = RESULT_MS; r.at = now;
    r.result = { text, winners: winners.map((w) => w.id), top, board: rows };
    orbs.setFrozen(g.net, true);
  }

  // ---- host: bots ----
  function spawnBots(g) {
    const spots = [[-8, -7], [8, 7]];
    g.bots = BOT_NAMES.map((name, i) => ({ id: `bot-${i + 1}`, name, x: spots[i][0], z: spots[i][1] }));
  }

  function steer(g, b, dt) {
    const list = orbs.snapshot(g.net).orbs;
    let tgt = null, best = Infinity;
    for (const t of list) { const d = Math.hypot(t.x - b.x, t.z - b.z); if (d < best) { best = d; tgt = t; } }
    if (!tgt) return;
    if (best <= BOT_REACH) { orbs.collectFor(g.net, b.id, tgt.id); return; }
    const gx = (tgt.x - b.x) / best, gz = (tgt.z - b.z) / best;
    let sx = gx, sz = gz;
    for (const ob of orbs.obstacles) {
      const dx = b.x - ob.x, dz = b.z - ob.z, d = Math.hypot(dx, dz), range = ob.r + 1.6;
      if (d >= range || d < 0.001) continue;
      const ax = dx / d, az = dz / d, w = ((range - d) / range) * 2;
      let tx = -az, tz = ax;                       // slide round the prop, on the side the orb is on
      if (tx * gx + tz * gz < 0) { tx = -tx; tz = -tz; }
      sx += (ax * 0.9 + tx * 1.4) * w; sz += (az * 0.9 + tz * 1.4) * w;
    }
    for (const other of g.bots) {                  // and keep a little apart
      if (other === b) continue;
      const dx = b.x - other.x, dz = b.z - other.z, d = Math.hypot(dx, dz);
      if (d < 1.6 && d > 0.001) { sx += (dx / d) * (1.6 - d); sz += (dz / d) * (1.6 - d); }
    }
    const sl = Math.hypot(sx, sz) || 1;
    b.x += (sx / sl) * BOT_SPEED * dt; b.z += (sz / sl) * BOT_SPEED * dt;
    b.x = Math.max(-ARENA, Math.min(ARENA, b.x)); b.z = Math.max(-ARENA, Math.min(ARENA, b.z));
    for (const ob of orbs.obstacles) {             // never inside a prop (the crate and pillars are far smaller than the avoid radius)
      const dx = b.x - ob.x, dz = b.z - ob.z, d = Math.hypot(dx, dz), hard = ob.r * 0.5 + 0.45;
      if (d < hard && d > 0.001) { b.x = ob.x + (dx / d) * hard; b.z = ob.z + (dz / d) * hard; }
    }
  }

  function hostTick(g, now, dt) {
    if (g.round.n === 0) startRound(g, now);
    const alone = g.room.status === 'online' && g.room.peers.size === 0;
    if (alone) {
      if (g.aloneSince == null) g.aloneSince = now;
      if (now - g.aloneSince >= ALONE_MS && !g.bots.length) spawnBots(g);
    } else {
      g.aloneSince = null;
      if (g.bots.length) { g.bots = []; orbs.dropScores(g.net, (k) => k.startsWith('bot-')); }
    }
    if (remaining(g, now) <= 0) {
      if (g.round.phase === 'play') endRound(g, now); else startRound(g, now);
    }
    if (g.round.phase === 'play') for (const b of g.bots) steer(g, b, dt);
  }

  // ---- page: timer, result card, confetti, bots in the scene ----
  function paintTimer(g, now) {
    if (!ui.timer) return;
    const r = g.round, left = remaining(g, now);
    let text, pulse = false;
    if (r.n === 0) text = '…';
    else if (r.phase === 'result') text = 'Time!';
    else { text = fmtClock(left); pulse = Math.ceil(left / 1000) <= PULSE_S; }
    const key = `${text}|${pulse}|${r.n}`;
    if (key === lastTimer) return;
    lastTimer = key;
    ui.timer.innerHTML = `<span class="rd">${r.n ? `Round ${r.n}` : 'Round'}</span><b class="tm">${esc(text)}</b>`;
    ui.timer.classList.toggle('pulse', pulse);
    ui.timer.dataset.phase = r.phase;
    ui.timer.dataset.left = String(Math.ceil(left / 1000));
  }

  function paintCard(g, now) {
    const el = ui.result;
    if (!el) return;
    const r = g.round;
    if (r.phase !== 'result' || !r.result) {
      if (!el.hidden) { el.hidden = true; lastCard = ''; }
      return;
    }
    const secs = Math.max(1, Math.ceil(remaining(g, now) / 1000));
    const me = mainNet?.id;
    const key = `${r.n}|${secs}`;
    if (key === lastCard && !el.hidden) return;
    lastCard = key;
    const res = r.result;
    el.innerHTML = `<div class="rt-title">${res.winners.length ? '🏆 ' : ''}${esc(res.text)}</div>`
      + `<ol class="rt-board">${res.board.slice(0, 6).map((row) => `<li class="${row.id === me ? 'you' : ''}"><span class="nm">${esc(row.name)}${row.id === me ? ' (you)' : ''}</span><span class="sc">${row.score}</span></li>`).join('')}</ol>`
      + `<div class="rt-next">New round in ${secs}…</div>`;
    el.hidden = false;
  }

  function stepConfetti(g, dt) {
    const cv = ui.confetti;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const active = g.round.phase === 'result' && g.round.result;
    if (active && g.round.n !== shownN) {          // a new result: one burst from above
      shownN = g.round.n;
      cv.width = Math.max(1, innerWidth); cv.height = Math.max(1, innerHeight);
      confetti = Array.from({ length: CONFETTI_N }, (_, i) => ({
        x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
        vx: (Math.random() - 0.5) * 120, vy: 140 + Math.random() * 220,
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, a: Math.random() * 6, va: (Math.random() - 0.5) * 14,
        c: COLORS[i % COLORS.length],
      }));
    }
    if (!active && !confetti.length) return;
    if (!active) confetti = [];
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of confetti) {
      p.x += p.vx * dt + Math.sin(p.a) * 20 * dt; p.y += p.vy * dt; p.a += p.va * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    confetti = confetti.filter((p) => p.y < cv.height + 30);
    if (!active) confetti = [];
  }

  function paintBots(g, dt) {
    if (!makeBot) return;
    const live = new Set(g.bots.map((b) => b.id));
    for (const [id, v] of views) if (!live.has(id)) { v.root.dispose(false, true); views.delete(id); }
    const k = 1 - Math.exp(-dt * 14);
    for (const b of g.bots) {
      let v = views.get(b.id);
      if (!v) {
        const root = makeBot(b.id, b.name);
        root.position.set(b.x, 0, b.z);
        v = { root, x: b.x, z: b.z };
        views.set(b.id, v);
      }
      const nx = v.x + (b.x - v.x) * k, nz = v.z + (b.z - v.z) * k;
      const mx = nx - v.x, mz = nz - v.z;
      v.x = nx; v.z = nz;
      v.root.position.x = nx; v.root.position.z = nz;
      if (Math.hypot(mx, mz) > 0.002) {
        let d = Math.atan2(mx, mz) - v.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        v.root.rotation.y += d * (1 - Math.exp(-dt * 10));
      }
    }
  }

  function tick(now = performance.now()) {
    const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0.016;
    lastTick = now;
    for (const g of games.values()) if (g.room.isHost) hostTick(g, now, dt);
    const g = mainRoom && games.get(mainRoom);
    if (!g) return;
    paintTimer(g, now); paintCard(g, now); stepConfetti(g, dt); paintBots(g, dt);
  }

  /** The page's live scoreboard (orbs.mjs scoreHtml): everyone, high score first; you in bold. */
  function boardHtml(scores, net) {
    const g = mainRoom && games.get(mainRoom);
    if (!g) return '';
    const me = net?.id;
    return board(net, g, scores, (id) => (id === me ? 'You' : nameOf(net, g, id)))
      .map((r) => `<div class="row${r.id === me ? ' me' : ''}"><span class="nm">${esc(r.name)}</span> <span class="sc">${r.score}</span></div>`).join('');
  }

  /** Short-round option (the page's ?round=, and the playtest's setup shortcut): the host restarts the round at this length. */
  function configure(seconds) {
    lenMs = Math.round(Math.min(600, Math.max(3, Number(seconds) || ROUND_SECONDS)) * 1000);
    const g = mainRoom && games.get(mainRoom);
    if (g && g.room.isHost) { startRound(g, performance.now()); return true; }
    return false;
  }

  function snapshot(net) {
    const room = asRoom(net);
    const g = room && games.get(room);
    if (!g) return { n: 0, phase: 'play', left: 0, len: lenMs, result: null, bots: [] };
    return {
      n: g.round.n, phase: g.round.phase, left: Math.round(remaining(g, performance.now())), len: g.round.len,
      result: g.round.result ? JSON.parse(JSON.stringify(g.round.result)) : null,
      bots: g.bots.map((b) => ({ ...b })),
    };
  }

  return {
    wire, tick, boardHtml, configure, snapshot,
    get seconds() { return lenMs / 1000; },
    get confettiCount() { return confetti.length; },
    botNodes: () => [...views.values()].map((v) => v.root),
    attachMain(net) {
      mainNet = net;
      const room = asRoom(net);
      if (!room) return null;
      mainRoom = room;
      return wire(net);
    },
  };
}
