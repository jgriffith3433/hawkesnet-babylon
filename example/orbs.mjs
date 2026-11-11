// Host-authoritative orb collect for the Babylon demo: sync.state('orbs') + sync.action('orb-touch' / 'orb-award').
// Six glowing orbs sit on a downward-ray hit above the flagstone floor; walk into one to score. Scores keyed by peer id;
// host migration keeps them. Bob/glow are local paint only — no timers fetch the service.

export const ORB_N = 6;
export const ORB_R = 0.42;
export const ORB_LIFT = 0.55; // centre height above the ground hit (fixed; never buried in props)
export const TOUCH_R = 1.15;  // xz collect radius (capsule ~0.35 + orb)
const ARENA = 13.5;           // inside the pillars (at 15) and floor edge
const ORB_PAD = 3.5;
const PLACE_TRIES = 40;

/** Room with sync, or a lobby that holds one. */
function asRoom(net) {
  if (!net) return null;
  if (net.sync && typeof net.sync.state === 'function') return net;
  if (net.room?.sync) return net.room;
  return null;
}

/**
 * @param {object} o
 * @param {*} o.BABYLON
 * @param {*} o.scene
 * @param {(kind: 'self' | 'other') => void} [o.onCollect]
 * @param {(html: string) => void} [o.onHud]
 */
export function createOrbs(o) {
  const B = o.BABYLON, scene = o.scene;
  const onCollect = o.onCollect || (() => {});
  const onHud = o.onHud || (() => {});
  const scoreHtml = o.scoreHtml || null; // (scores, net) => html: the page's own (sorted, round-aware) scoreboard
  const games = new WeakMap(); // Room -> local mirror
  const meshes = new Map();    // id -> mesh bits (page visual only)
  let mainRoom = null;
  let mainNet = null;          // lobby or room used for HUD peer names
  let lastHud = '';

  const obstacles = [{ x: 3, z: 3, r: 1.6 }];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    obstacles.push({ x: Math.cos(a) * 15, z: Math.sin(a) * 15, r: 2.0 });
  }

  function clearOfProps(x, z, orbs, selfId) {
    if (Math.abs(x) > ARENA || Math.abs(z) > ARENA) return false;
    if (Math.abs(x) < ORB_PAD && Math.abs(z) < ORB_PAD) return false;
    for (const ob of obstacles) if (Math.hypot(x - ob.x, z - ob.z) < ob.r) return false;
    for (const orb of orbs) {
      if (orb.id === selfId) continue;
      if (Math.hypot(x - orb.x, z - orb.z) < 2.6) return false;
    }
    return true;
  }

  /** Downward ray onto the flagstone; y = ground hit + ORB_LIFT. */
  function placeAt(x, z) {
    const ray = new B.Ray(new B.Vector3(x, 48, z), new B.Vector3(0, -1, 0), 80);
    const hit = scene.pickWithRay(ray, (m) => m && m.name === 'ground');
    const y = hit?.hit && hit.pickedPoint ? hit.pickedPoint.y + ORB_LIFT : ORB_LIFT;
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100 };
  }

  function randSpot(orbs, selfId) {
    for (let t = 0; t < PLACE_TRIES; t++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = ORB_PAD + Math.random() * (ARENA - ORB_PAD);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (clearOfProps(x, z, orbs, selfId)) return placeAt(x, z);
    }
    for (const [x, z] of [[6, 0], [-6, 0], [0, 6], [0, -6], [8, 8], [-8, -8]]) {
      if (clearOfProps(x, z, orbs, selfId)) return placeAt(x, z);
    }
    return placeAt(7, -5);
  }

  function freshOrbs() {
    const orbs = [];
    for (let i = 0; i < ORB_N; i++) {
      const p = randSpot(orbs, `o${i}`);
      orbs.push({ id: `o${i}`, x: p.x, y: p.y, z: p.z, gen: 1 });
    }
    return orbs;
  }

  function ensureMesh(orb) {
    let m = meshes.get(orb.id);
    if (m) return m;
    const root = new B.TransformNode(`orb-${orb.id}`, scene);
    const body = B.MeshBuilder.CreateSphere(`orb-body-${orb.id}`, { diameter: ORB_R * 2, segments: 16 }, scene);
    body.parent = root; body.isPickable = false;
    const mat = new B.StandardMaterial(`orb-mat-${orb.id}`, scene);
    mat.diffuseColor = B.Color3.Black();
    mat.emissiveColor = new B.Color3(0.35, 0.95, 1);
    mat.disableLighting = true;
    body.material = mat;
    const glow = B.MeshBuilder.CreateSphere(`orb-glow-${orb.id}`, { diameter: ORB_R * 3.2, segments: 12 }, scene);
    glow.parent = root; glow.isPickable = false;
    const gm = new B.StandardMaterial(`orb-glowmat-${orb.id}`, scene);
    gm.diffuseColor = B.Color3.Black();
    gm.emissiveColor = new B.Color3(0.2, 0.7, 0.9);
    gm.alpha = 0.22;
    gm.disableLighting = true;
    glow.material = gm;
    // Soft disc on the stone under the orb (world-placed, not parented, so bobbing never lifts it).
    const pad = B.MeshBuilder.CreateGround(`orb-pad-${orb.id}`, { width: ORB_R * 2.8, height: ORB_R * 2.8 }, scene);
    pad.position.set(orb.x, 0.02, orb.z); pad.isPickable = false;
    const pm = new B.StandardMaterial(`orb-padmat-${orb.id}`, scene);
    pm.diffuseColor = B.Color3.Black();
    pm.emissiveColor = new B.Color3(0.15, 0.55, 0.7);
    pm.alpha = 0.45;
    pm.disableLighting = true;
    pad.material = pm;
    m = { root, body, glow, pad, mat, gm, pm, baseY: orb.y, phase: Math.random() * Math.PI * 2, flashUntil: 0 };
    meshes.set(orb.id, m);
    return m;
  }

  function syncMeshes(game) {
    if (!game || game !== games.get(mainRoom)) return;
    const live = new Set(game.orbs.map((o) => o.id));
    for (const [id, m] of meshes) {
      if (!live.has(id)) {
        m.body.dispose(); m.glow.dispose(); m.pad.dispose(); m.root.dispose();
        m.mat.dispose(); m.gm.dispose(); m.pm.dispose();
        meshes.delete(id);
      }
    }
    for (const orb of game.orbs) {
      const m = ensureMesh(orb);
      const moved = Math.abs(m.baseY - orb.y) > 0.01
        || Math.abs(m.root.position.x - orb.x) > 0.01
        || Math.abs(m.root.position.z - orb.z) > 0.01;
      m.baseY = orb.y;
      m.root.position.set(orb.x, orb.y, orb.z);
      m.pad.position.set(orb.x, 0.02, orb.z);
      if (moved) m.flashUntil = performance.now() + 380;
    }
    paintHud(game);
  }

  function paintHud(game) {
    if (!game || !mainNet) return;
    if (scoreHtml) {
      const h = scoreHtml(game.scores, mainNet);
      if (h !== lastHud) { lastHud = h; onHud(h); }
      return;
    }
    const mine = mainNet.id;
    const rows = [`You ${game.scores[mine] || 0}`];
    const peers = mainNet.peers || mainRoom?.peers;
    if (peers) {
      for (const p of [...peers.values()].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))) {
        rows.push(`${String(p.name || p.id).slice(0, 14)} ${game.scores[p.id] || 0}`);
      }
    }
    const html = rows.map((r, i) => (i === 0 ? `<b>${r}</b>` : r)).join('<br>');
    if (html !== lastHud) { lastHud = html; onHud(html); }
  }

  function bootHost(room, game) {
    if (!room?.isHost || !game) return;
    if (game.orbs.length !== ORB_N) {
      game.orbs = freshOrbs();
      game.scores = { ...game.scores };
      syncMeshes(game);
    }
  }

  function wire(net) {
    const room = asRoom(net);
    if (!room) return null;
    if (games.has(room)) return games.get(room);

    const game = { orbs: [], scores: {}, seq: 0, applied: new Set(), sentTouch: '', frozen: false };
    const visual = room === mainRoom || (!mainRoom && net);

    room.sync.state('orbs', {
      get: () => ({ orbs: game.orbs, scores: game.scores, seq: game.seq }),
      set: (s) => {
        if (!s || typeof s !== 'object') return;
        if (Array.isArray(s.orbs)) {
          game.orbs = s.orbs.map((o) => ({
            id: String(o.id),
            x: +o.x,
            y: Number.isFinite(+o.y) ? +o.y : ORB_LIFT,
            z: +o.z,
            gen: +o.gen || 1,
          }));
        }
        if (s.scores && typeof s.scores === 'object') game.scores = { ...s.scores };
        if (Number.isFinite(s.seq)) game.seq = s.seq;
        syncMeshes(game);
      },
      rate: 8,
    });

    game.award = room.sync.action('orb-award', (data) => {
      if (!data || data.n == null || game.applied.has(data.n)) return;
      game.applied.add(data.n);
      if (game.applied.size > 200) game.applied = new Set([...game.applied].slice(-80));
      game.seq = Math.max(game.seq, data.n);
      const by = String(data.by || '');
      if (by) game.scores[by] = (game.scores[by] || 0) + 1;
      const orb = game.orbs.find((x) => x.id === data.orb);
      if (orb) {
        orb.x = +data.nx; orb.y = +data.ny; orb.z = +data.nz; orb.gen = (orb.gen || 1) + 1;
      }
      if (game.sentTouch.startsWith(`${data.orb}:`)) game.sentTouch = '';
      syncMeshes(game);
      if (visual && by) onCollect(by === (mainNet?.id || room.id) ? 'self' : 'other');
      paintHud(game);
    });

    game.touch = room.sync.action('orb-touch', (data, { authoritative }) => {
      if (!authoritative || !data || game.frozen) return; // frozen: between rounds nobody scores
      const orb = game.orbs.find((x) => x.id === data.orb);
      if (!orb || (data.gen != null && data.gen !== orb.gen)) return;
      const p = randSpot(game.orbs, orb.id);
      game.award({ orb: orb.id, by: data.by, nx: p.x, ny: p.y, nz: p.z, n: game.seq + 1 });
    });

    bootHost(room, game);
    room.sync.onHost(() => { if (room.isHost) bootHost(room, game); });
    games.set(room, game);
    if (visual) syncMeshes(game);
    return game;
  }

  function touchAt(net, x, z) {
    const room = asRoom(net);
    const game = room && (games.get(room) || wire(net));
    const id = net?.id ?? room?.id;
    if (!game?.touch || !id) return false;
    for (const orb of game.orbs) {
      if (Math.hypot(orb.x - x, orb.z - z) <= TOUCH_R) {
        const key = `${orb.id}:${orb.gen}`;
        if (game.sentTouch === key) return false;
        game.sentTouch = key;
        game.touch({ orb: orb.id, gen: orb.gen, by: id });
        return true;
      }
    }
    return false;
  }

  // Host-side hooks for the round game (rounds.mjs): freeze scoring, reset or trim scores, award a bot.
  function hostGame(net) {
    const room = asRoom(net);
    const game = room && (games.get(room) || wire(net));
    return game && room.isHost ? game : null;
  }
  function setFrozen(net, on) { const g = hostGame(net); if (g) g.frozen = Boolean(on); }
  function resetScores(net) { const g = hostGame(net); if (g) g.scores = {}; }
  function dropScores(net, pred) {
    const g = hostGame(net);
    if (!g) return;
    const next = {};
    for (const [k, v] of Object.entries(g.scores)) if (!pred(k)) next[k] = v;
    g.scores = next;
  }
  /** The host collects an orb for a bot (same award path as a touch, no peer needed). */
  function collectFor(net, by, orbId) {
    const g = hostGame(net);
    const orb = g && !g.frozen && g.orbs.find((x) => x.id === orbId);
    if (!orb) return false;
    const p = randSpot(g.orbs, orb.id);
    g.award({ orb: orb.id, by, nx: p.x, ny: p.y, nz: p.z, n: g.seq + 1 });
    return true;
  }

  function snapshot(net) {
    const room = asRoom(net);
    const game = room && games.get(room);
    if (!game) return { orbs: [], scores: {} };
    return { orbs: game.orbs.map((o) => ({ ...o })), scores: { ...game.scores } };
  }

  function tick(tMs) {
    const game = mainRoom && games.get(mainRoom);
    if (!game) return;
    const pulse = 0.7 + 0.3 * Math.sin(tMs / 280);
    for (const orb of game.orbs) {
      const m = meshes.get(orb.id);
      if (!m) continue;
      m.root.position.y = m.baseY + Math.sin(tMs / 420 + m.phase) * 0.14;
      const flash = m.flashUntil > tMs ? (m.flashUntil - tMs) / 380 : 0;
      m.mat.emissiveColor.set(0.25 + 0.2 * pulse + 0.5 * flash, 0.85 + 0.15 * pulse, 1);
      m.gm.alpha = 0.14 + 0.14 * pulse + 0.25 * flash;
      m.glow.scaling.setAll(0.95 + 0.12 * pulse + 0.35 * flash);
      m.pm.alpha = 0.35 + 0.2 * pulse + 0.4 * flash;
      m.pad.scaling.setAll(1 + 0.5 * flash);
    }
    paintHud(game);
  }

  function groundGaps() {
    const game = mainRoom && games.get(mainRoom);
    const out = [];
    for (const orb of game?.orbs || []) {
      const hit = placeAt(orb.x, orb.z);
      // Orbs float on purpose: gap is centre vs the downward-ray target (ground + ORB_LIFT), not base-on-floor.
      const gap = orb.y - hit.y;
      out.push({ id: orb.id, gap, y: orb.y });
    }
    return out;
  }

  return {
    ORB_N, ORB_R, TOUCH_R, ORB_LIFT,
    obstacles,
    setFrozen, resetScores, dropScores, collectFor,
    wire,
    touchAt,
    snapshot,
    tick,
    groundGaps,
    /** Bind the page's lobby/room so meshes and the score HUD follow it. */
    attachMain(net) {
      mainNet = net;
      const room = asRoom(net);
      if (!room) return null;
      mainRoom = room;
      return wire(net);
    },
  };
}
