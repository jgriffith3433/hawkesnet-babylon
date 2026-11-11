// Orb-game checks for the Babylon demo (host-authoritative sync.state / sync.action). Wired from example/index.html;
// the shared net-playtest.mjs stays free of page-only checks (same pattern as hawkesnet's orbs-playtest.mjs).
//
// Used from smoke's `extra` (second player already in the page) and from two-players via `afterTwoPlayers`
// (opens a short-lived bot as player B, steers it onto an orb by pose, asserts A sees the score and respawn).

import { ORB_N } from './orbs.mjs';

const SCORE_MS = 500;

function orbsApi() {
  const a = typeof window !== 'undefined' ? window.hawkesBabylonOrbs : null;
  if (!a || typeof a.snapshot !== 'function' || typeof a.wire !== 'function' || typeof a.touchAt !== 'function') {
    throw new Error('the demo has no hawkesBabylonOrbs API');
  }
  return a;
}

function sameOrbs(a, b) {
  if (a.length !== b.length) return false;
  const key = (o) => `${o.id}:${Math.round(o.x * 100)}:${Math.round(o.z * 100)}:${o.gen || 0}`;
  return a.map(key).sort().join('|') === b.map(key).sort().join('|');
}

function sameScores(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return false;
  return true;
}

/**
 * Criterion checks: same 6 orbs, B collects → A sees score within 500 ms and the orb moves, a late joiner sees
 * scores and orbs. `collector` is the lobby that will be steered onto an orb. `main` is player A's lobby.
 */
export async function orbChecks({ check, main, collector, until, wait, metric, openLate, event = () => {}, scene: setScene }) {
  const api = orbsApi();
  await until(() => main?.ready || main?.room?.status === 'online', 15000, 'player A to be in the room');
  await until(() => collector?.ready || collector?.room?.status === 'online', 15000, 'the collector to be in the room');
  api.wire(main);
  api.wire(collector);

  if (setScene) setScene('Orbs');

  await check('Both players see the same 6 orbs at the same spots', async () => {
    const ms = await until(() => {
      const a = api.snapshot(main), b = api.snapshot(collector);
      return a.orbs.length === ORB_N && b.orbs.length === ORB_N && sameOrbs(a.orbs, b.orbs);
    }, 10000, 'both sides to hold the same 6 orbs');
    const a = api.snapshot(main);
    metric('orbCount', a.orbs.length);
    metric('orbsSyncMs', Math.round(ms));
    event('orbs', a.orbs.map((o) => `${o.id}@${o.x.toFixed(1)},${o.z.toFixed(1)}`).join(' '));
    // Ground contact: each orb's base within quality.ground-contact limits.
    if (typeof api.groundGaps === 'function') {
      for (const g of api.groundGaps()) {
        if (g.gap > 0.02 || g.gap < -0.05) {
          throw new Error(`quality.ground-contact: ${g.id} ${(g.gap * 100).toFixed(0)} cm off the ground`);
        }
      }
      metric('quality.maxQuietSeconds', 0);
    }
    return `${a.orbs.length} orbs match after ${Math.round(ms)} ms`;
  });

  // A round boundary freezes scoring for 3 s and resets scores: start the collect check well inside a round.
  const rounds = typeof window !== 'undefined' ? window.hawkesBabylonRounds : null;
  if (rounds) await until(() => { const r = rounds.snapshot(main); return r.n === 0 || (r.phase === 'play' && r.left > 8000); }, 75000, 'a fresh round to start');

  await check("Collecting an orb raises that player's score on both screens within half a second, and the orb respawns", async () => {
    const before = api.snapshot(main);
    const target = before.orbs[0] && { ...before.orbs[0] };
    if (!target) throw new Error('no orb to collect');
    const bid = collector.id;
    const scoreBefore = before.scores[bid] || 0;
    let touchedAt = null;
    // Steer B onto the orb by pose (same path a lobby peer already uses), then the demo's touch check sends collect.
    for (let i = 0; i < 48; i++) {
      const u = (i + 1) / 48;
      const x = target.x - 2.5 + 2.5 * u, z = target.z;
      collector.pose([x, 0, z], 0);
      if (Math.hypot(x - target.x, z - target.z) <= 1.2) {
        if (touchedAt == null) touchedAt = performance.now();
        api.touchAt(collector, x, z);
      }
      await wait(25);
      if ((api.snapshot(main).scores[bid] || 0) > scoreBefore) break;
    }
    if (touchedAt == null) throw new Error('player B never reached the orb');
    await until(() => {
      const a = api.snapshot(main), b = api.snapshot(collector);
      const rose = (a.scores[bid] || 0) > scoreBefore && (b.scores[bid] || 0) > scoreBefore;
      const moved = (side) => {
        const o = side.orbs.find((x) => x.id === target.id);
        return o && (Math.abs(o.x - target.x) > 0.05 || Math.abs(o.z - target.z) > 0.05 || o.gen !== target.gen);
      };
      return rose && moved(a) && moved(b);
    }, SCORE_MS + 2500, () => {
      const a = api.snapshot(main);
      return `A to see B's score rise and the orb move (score ${a.scores[bid] || 0}, was ${scoreBefore})`;
    });
    const ms = Math.round(performance.now() - touchedAt);
    metric('orbCollectMs', ms);
    if (ms > SCORE_MS) throw new Error(`score and respawn took ${ms} ms from touch, limit is ${SCORE_MS} ms`);
    const after = api.snapshot(main);
    event('collect', `B ${bid} score ${scoreBefore}→${after.scores[bid]} orb ${target.id} moved in ${ms} ms`);
    if (setScene) setScene('Orbs collect');
    return `B's score ${scoreBefore}→${after.scores[bid]} on both screens, orb respawned in ${ms} ms`;
  });

  if (openLate) {
    let late = null;
    try {
      await check('A player who joins mid-round sees the current scores and orbs', async () => {
        const expect = api.snapshot(main);
        late = await openLate();
        await until(() => late?.ready || late?.room?.status === 'online', 15000, 'the late joiner to be online');
        api.wire(late);
        const ms = await until(() => {
          const s = api.snapshot(late);
          return s.orbs.length === ORB_N && sameOrbs(s.orbs, expect.orbs) && sameScores(s.scores, expect.scores);
        }, 12000, 'the late joiner to receive orbs and scores');
        metric('lateJoinOrbsMs', Math.round(ms));
        const s = api.snapshot(late);
        event('late-join', `${s.orbs.length} orbs, scores ${JSON.stringify(s.scores)}`);
        return `${s.orbs.length} orbs and ${Object.keys(s.scores).length} score(s) in ${Math.round(ms)} ms`;
      });
    } finally {
      try { await late?.leave(); } catch { /* gone */ }
    }
  }
}
