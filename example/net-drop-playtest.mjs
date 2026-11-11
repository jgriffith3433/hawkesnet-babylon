// Drop-and-recover and bad-network checks for the Babylon demo (wired from example/index.html; the shared
// net-playtest.mjs stays free of page-only checks). Player A is this page, player B is another real client in the
// same room: the phone frame (390x844, touch) in the `drop-recover` scenario, a lobby bot in two-players.
//
//   recoverChecks  B scores an orb, is dropped for 5 s (hawkesPlaytest.dropFor(5000) on B), and must be back within
//                  RECOVER_MS of the network returning with the same name, colour and score, on both clients.
//   jumpChecks     B walks while its pose stream is slowed to 250 ms latency and 5% loss; A reports the largest
//                  per-frame jump of B's avatar and fails over MAX_JUMP_M.
//
// Every state emits event('shot:<state>') so Studio captures a frame there.

export const DROP_MS = 5000;
export const RECOVER_MS = 2000;
export const MAX_JUMP_M = 0.5;
export const NET = { latencyMs: 250, loss: 0.05 };

/**
 * Slow B's outgoing pose stream: every pose is held for latencyMs (in order) and `loss` of them are dropped. The page cannot reach
 * CDP (Network.emulateNetworkConditions), so this applies the same latency and loss to what B sends A. Returns a restore().
 */
export function throttlePoses(b, { latencyMs = NET.latencyMs, loss = NET.loss, rnd = Math.random } = {}) {
  const orig = b.pose;
  const stats = { sent: 0, dropped: 0 };
  b.pose = (...args) => {
    stats.sent++;
    if (rnd() < loss) { stats.dropped++; return; }
    setTimeout(() => { try { orig.apply(b, args); } catch { /* left */ } }, latencyMs);
  };
  return Object.assign(() => { b.pose = orig; }, { stats });
}

/** The sample: largest distance one avatar moves between two rendered frames while `run` is going. */
export async function measureJump({ onFrame, pos, run }) {
  let last = null, max = 0, frames = 0;
  const off = onFrame(() => {
    const p = pos();
    if (!p) { last = null; return; }
    if (last) { max = Math.max(max, Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2])); frames++; }
    last = p.slice();
  });
  try { await run(); } finally { off(); }
  return { max, frames };
}

/**
 * @param c.check,until,wait,metric,event,scene   the runner's context
 * @param c.main      A's lobby
 * @param c.b         B's lobby
 * @param c.orbs      window.hawkesBabylonOrbs
 * @param c.collect   async () => steers B onto an orb (real input where B is a page)
 * @param c.dropB     (ms) => drops B's connection and blocks reconnect for ms
 * @param c.seen      (id) => { name, hue, away } as A draws that player
 * @param c.bIdent    () => { name, hue } B's own idea of itself
 */
export async function recoverChecks(c) {
  const { check, until, wait, metric, main, b, orbs } = c;
  const event = c.event || (() => {}), setScene = c.scene || (() => {});
  const online = (l) => l?.ready || l?.room?.status === 'online';
  await until(() => online(main) && online(b) && main.peers.has(b.id), 20000, 'both players to be in the room');
  orbs.wire(main); orbs.wire(b);
  const rounds = typeof window !== 'undefined' ? window.hawkesBabylonRounds : null;
  if (rounds) await until(() => { const r = rounds.snapshot(main); return r.n === 0 || (r.phase === 'play' && r.left > 12000); }, 75000, 'a round with time left');
  const bid = b.id;
  const before = {};
  setScene('B scores');
  await check('Player B scores an orb and both clients show the same score', async () => {
    const was = orbs.snapshot(main).scores[bid] || 0;
    await c.collect();
    await until(() => (orbs.snapshot(main).scores[bid] || 0) > was && (orbs.snapshot(b).scores[bid] || 0) === orbs.snapshot(main).scores[bid], 8000, "B's score to match on both clients");
    const s = c.seen(bid), mine = c.bIdent();
    Object.assign(before, { name: s.name, hue: s.hue, score: orbs.snapshot(main).scores[bid] });
    if (!before.name || mine.name !== before.name) throw new Error(`A shows B as "${before.name}", B calls itself "${mine.name}"`);
    if (before.hue !== mine.hue) throw new Error(`A draws B in hue ${before.hue}, B is hue ${mine.hue}`);
    metric('scoreBefore', before.score);
    event('shot:b-scored', `${before.name} hue ${before.hue} score ${before.score}`);
    return `${before.name}, hue ${before.hue}, score ${before.score} on both clients`;
  });
  setScene('B dropped');
  await check(`Dropped for ${DROP_MS / 1000} s, B is back within ${RECOVER_MS} ms with the same name, colour and score`, async () => {
    const t0 = performance.now();
    if (!c.dropB(DROP_MS)) throw new Error('no open socket to drop on player B');
    event('shot:b-dropped', 'B socket closed, reconnect blocked for 5 s');
    await until(() => c.seen(bid)?.away, 12000, 'A to mark B away');
    event('shot:b-away', `A shows B away after ${Math.round(performance.now() - t0)} ms`);
    // The network is back at t0 + DROP_MS; recovery is how long after that B is a normal player again on both sides.
    await until(() => online(b) && c.seen(bid) && !c.seen(bid).away && b.id === bid, DROP_MS + 15000, 'B to be back in the room');
    const total = Math.round(performance.now() - t0), ms = Math.max(0, total - DROP_MS);
    metric('recoverMs', ms); metric('dropTotalMs', total);
    event('shot:b-back', `back ${ms} ms after the network returned (${total} ms from the drop)`);
    if (ms > RECOVER_MS) throw new Error(`B took ${ms} ms to come back (limit ${RECOVER_MS} ms)`);
    await until(() => orbs.snapshot(main).scores[bid] === before.score && orbs.snapshot(b).scores[bid] === before.score, 5000,
      () => `B's score ${before.score} on both clients (A ${orbs.snapshot(main).scores[bid]}, B ${orbs.snapshot(b).scores[bid]})`);
    const s = c.seen(bid), mine = c.bIdent();
    if (s.name !== before.name || mine.name !== before.name) throw new Error(`name changed: "${before.name}" → A "${s.name}", B "${mine.name}"`);
    if (s.hue !== before.hue || mine.hue !== before.hue) throw new Error(`colour changed: hue ${before.hue} → A ${s.hue}, B ${mine.hue}`);
    event('shot:b-same', `${s.name}, hue ${s.hue}, score ${before.score}`);
    return `back ${ms} ms after the network returned; still ${s.name}, hue ${s.hue}, score ${before.score} on both clients`;
  });
}

/**
 * @param c.walk   async () => B walks for a few seconds (real input where B is a page; poses otherwise)
 * @param c.onFrame (fn) => off: A's per-frame hook;  c.pos () => [x,y,z] of B's avatar on A
 */
export async function jumpChecks(c) {
  const { check, metric, b } = c;
  const event = c.event || (() => {}), setScene = c.scene || (() => {});
  setScene('Bad network');
  await check(`At ${NET.latencyMs} ms and ${NET.loss * 100}% loss B's avatar never jumps more than ${MAX_JUMP_M} m in a frame`, async () => {
    const restore = throttlePoses(b);
    event('shot:net-throttled', `${NET.latencyMs} ms latency, ${NET.loss * 100}% loss on B's pose stream`);
    let res;
    try {
      res = await measureJump({ onFrame: c.onFrame, pos: c.pos, run: async () => { await c.walk(); event('shot:net-walking', `B walked, ${restore.stats.dropped}/${restore.stats.sent} poses dropped`); await c.wait(1200); } });
    } finally { restore(); }
    const m = Math.round(res.max * 1000) / 1000;
    metric('maxRemoteJumpM', m); metric('jumpFrames', res.frames); metric('posesDropped', restore.stats.dropped);
    event('shot:net-result', `largest remote-avatar jump ${m} m over ${res.frames} frames (${restore.stats.dropped}/${restore.stats.sent} poses dropped)`);
    if (res.frames < 60) throw new Error(`only ${res.frames} frames sampled, B's avatar was not on screen`);
    if (m > MAX_JUMP_M) throw new Error(`largest remote-avatar jump ${m} m is over ${MAX_JUMP_M} m`);
    return `largest jump ${m} m (limit ${MAX_JUMP_M} m) over ${res.frames} frames, ${restore.stats.dropped}/${restore.stats.sent} poses dropped`;
  });
}
