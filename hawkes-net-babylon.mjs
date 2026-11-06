// Hawkes Net for Babylon.js (https://net.hawkesgen.ai): multiplayer for a Babylon scene in a few lines. A shared room per
// area (the SDK's lobby: live and test rooms, shards, rejoining), everyone else drawn as an avatar played back smoothly a
// little behind (the SDK's Track on the room's clock), your player's place sent each frame, shared moving things
// simulated by one player at a time, and players in the background shown as away.
//
//   import * as BABYLON from '@babylonjs/core';
//   import { multiplayer } from '@hawkesgen/net-babylon';
//   const mp = multiplayer(scene, { babylon: BABYLON, project: 'my-game', name: 'Ada', player: myMesh, liveHosts: ['mygame.com'] });
//   mp.on('chat', (text, from) => console.log(from.name, text));
//   mp.send('chat', 'hi');
//   mp.share(crateMesh, 'crate-1');   // one player simulates it, everyone sees it move
import { lobby as makeLobby, background, inBackground, Track } from '@hawkesgen/net';

export { background, inBackground };
export const VERSION = '0.1.3';

const POSE_MS = 50;
const AWAY_ALPHA = 0.35;
const yawOf = (node) => {
  if (node.rotationQuaternion) {
    const q = node.rotationQuaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  }
  return node.rotation?.y ?? 0;
};
const SPAWN_MS = 550;
const LEAVE_MS = 600;
const EMOTE_MS = 1500;
const EMOTE_GAP_MS = 400;
const EMOTES = ['wave'];
const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const meshesOf = (node) => [node, ...node.getChildMeshes(false)].filter((m) => 'visibility' in m);
const hue = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 360) / 360; };

/** The default avatar: a capsule in the player's own color with their name over it. */
export function defaultAvatar(peer, B, scene) {
  const root = new B.TransformNode(`hn-avatar-${peer.id}`, scene);
  const body = B.MeshBuilder.CreateCapsule(`hn-body-${peer.id}`, { height: 1.8, radius: 0.35 }, scene);
  body.position.y = 0.9;
  body.parent = root;
  const mat = new B.StandardMaterial(`hn-mat-${peer.id}`, scene);
  mat.diffuseColor = B.Color3.FromHSV(hue(peer.id) * 360, 0.55, 0.95);
  body.material = mat;
  // The name tag needs a canvas (every page has one; Node doesn't): without one the capsule goes alone.
  const canvas = typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined';
  if (B.DynamicTexture && peer.name && canvas) {
    const tag = B.MeshBuilder.CreatePlane(`hn-tag-${peer.id}`, { width: 1.6, height: 0.4 }, scene);
    tag.position.y = 2.2;
    tag.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    tag.parent = root;
    const tex = new B.DynamicTexture(`hn-tagtex-${peer.id}`, { width: 512, height: 128 }, scene, false);
    tex.hasAlpha = true;
    try { tex.drawText(String(peer.name).slice(0, 20), null, 90, 'bold 64px sans-serif', 'white', 'transparent', true); } catch { /* no canvas (Node) */ }
    const tm = new B.StandardMaterial(`hn-tagmat-${peer.id}`, scene);
    tm.diffuseTexture = tex; tm.emissiveColor = new B.Color3(1, 1, 1); tm.disableLighting = true; tm.useAlphaFromDiffuseTexture = true; tm.backFaceCulling = false;
    tag.material = tm;
  }
  return root;
}

/**
 * A short emote on any node: a wave is a raised arm that swings for a moment (and the hand glows in the player's color).
 * Returns { update(now), done, dispose() }; multiplayer() drives it, or call update(performance.now()) each frame yourself.
 */
export function playEmote(node, kind, B, scene) {
  const pivot = new B.TransformNode(`hn-emote-${kind}`, scene);
  pivot.parent = node;
  pivot.position.set(0.45, 1.45, 0);
  const arm = B.MeshBuilder.CreateBox(`hn-emote-arm-${kind}`, { width: 0.14, height: 0.62, depth: 0.14 }, scene);
  arm.parent = pivot; arm.position.y = 0.31; arm.isPickable = false;
  const mat = new B.StandardMaterial(`hn-emote-mat-${kind}`, scene);
  mat.diffuseColor = new B.Color3(1, 0.86, 0.55); mat.emissiveColor = new B.Color3(0.45, 0.38, 0.2);
  arm.material = mat;
  const t0 = performance.now();
  const e = {
    kind, done: false,
    update(now) {
      const t = now - t0;
      if (t >= EMOTE_MS) return e.dispose();
      // Arm up (ease in), swing side to side, then lower.
      const up = Math.min(1, t / 200) * Math.min(1, (EMOTE_MS - t) / 200);
      pivot.rotation.z = -(0.25 + up * 2.3) + Math.sin(t / 55) * 0.35 * up;
    },
    dispose() { if (e.done) return; e.done = true; arm.dispose(); pivot.dispose(); mat.dispose(); },
  };
  e.update(t0);
  return e;
}

/**
 * Multiplayer for a Babylon scene. o: {
 *   babylon (the BABYLON namespace: import * as BABYLON from '@babylonjs/core', or the global build; default globalThis.BABYLON),
 *   project, name, area ('lobby'), liveHosts ([]), prefix, endpoint, transport ('relay'), key (servers and tests only),
 *   player (the mesh or node whose place and heading are yours; or getPose: () => ({ position: [x, y, z], yaw, extra })),
 *   avatar ((peer, BABYLON, scene) => a node: how others look; default a capsule with their name),
 *   emoteKeys ({ e: 'wave' }: a key press that emotes, seen by everyone; false for none; mp.emote('wave') does it by code),
 *   ... any other lobby / join option }
 */
export function multiplayer(scene, o = {}) {
  const B = o.babylon ?? globalThis.BABYLON;
  if (!B) throw new Error('hawkes-net-babylon: pass { babylon: BABYLON } (import * as BABYLON from "@babylonjs/core")');
  const { babylon, area = 'lobby', player, getPose, avatar = defaultAvatar, emoteKeys = { e: 'wave' }, ...rest } = o;
  // (An option given as undefined, `endpoint: q.get('net') || undefined`, must not override the SDK's default.)
  const join = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  const lobby = makeLobby({ transport: 'relay', ...join });
  const peers = new Map(); // id -> { id, name, away, node, track }
  const shared = new Map(); // id -> { node, track, owner }
  const clock = () => (lobby.room ? lobby.room.now() : Date.now());
  let poseAt = 0;
  const leaving = new Map(); // id -> { node, t0 }: avatars fading out
  const emotes = new Set(); // playing emotes
  const presence = []; // the last events: { type: 'spawn' | 'leave' | 'emote', id, name, emote?, at }
  const presenceFns = new Set();
  const note = (type, id, name, emote) => {
    const ev = { type, id, name, ...(emote ? { emote } : {}), at: Date.now() };
    presence.push(ev); if (presence.length > 50) presence.shift();
    for (const f of [...presenceFns]) { try { f(ev); } catch { /* a listener's problem */ } }
  };
  let lastEmote = 0;

  const ensure = (id) => {
    let p = peers.get(id);
    if (!p) {
      const info = lobby.room?.peers.get(id) ?? { id, name: '' };
      p = { id, name: info.name ?? '', away: Boolean(info.away), node: null, track: new Track({ pos: [0, 1, 2], yaw: [3] }, { clock }) };
      peers.set(id, p);
    }
    return p;
  };
  const setAway = (p) => {
    if (!p.node) return;
    const f = p.spawnAt ? Math.min(1, (performance.now() - p.spawnAt) / SPAWN_MS) : 1;
    for (const m of meshesOf(p.node)) m.visibility = (p.away ? AWAY_ALPHA : 1) * f;
  };
  // A ring on the floor that opens out and fades where a player appears.
  const ring = (at) => {
    const m = B.MeshBuilder.CreateTorus('hn-spawn-ring', { diameter: 1, thickness: 0.08, tessellation: 32 }, scene);
    m.position.set(at.x, 0.05, at.z); m.isPickable = false;
    const mat = new B.StandardMaterial('hn-spawn-ringmat', scene);
    mat.emissiveColor = new B.Color3(0.62, 0.91, 0.44); mat.disableLighting = true; mat.diffuseColor = B.Color3.Black();
    m.material = mat;
    return { m, mat, t0: performance.now() };
  };
  const rings = new Set();
  const drop = (id, now = false) => {
    const p = peers.get(id);
    if (!p) return;
    peers.delete(id);
    if (!p.node) return;
    if (now) { p.node.dispose(false, true); return; }
    leaving.set(id, { node: p.node, t0: performance.now(), name: p.name, base: meshesOf(p.node).map((m) => [m, m.visibility]) });
    note('leave', id, p.name);
  };
  const spawn = (p) => {
    p.node = avatar({ id: p.id, name: p.name }, B, scene);
    p.spawnAt = performance.now();
    p.baseScale = p.node.scaling ? p.node.scaling.clone() : null;
    setAway(p);
    if (p.node.scaling) p.node.scaling.scaleInPlace(0.01);
    const pos = p.track.sample(clock());
    rings.add(ring(pos ? { x: pos[0], z: pos[2] } : p.node.position));
    note('spawn', p.id, p.name);
  };
  const emote = (node, kind) => { if (node) emotes.add(playEmote(node, kind, B, scene)); };

  const offs = [
    lobby.onPose((id, s, at) => {
      if (!Array.isArray(s?.p)) return;
      const p = ensure(id);
      p.track.push(at, [s.p[0], s.p[1], s.p[2], s.y ?? 0], id);
      p.extra = s;
      if (!p.node) spawn(p);
    }),
    lobby.when('peer:join', (peer) => { const p = ensure(peer.id); p.name = peer.name ?? p.name; }),
    lobby.when('peer:leave', ({ peer }) => drop(peer.id)),
    lobby.when('peer:away', ({ peer, away }) => { const p = peers.get(peer.id); if (p) { p.away = away; setAway(p); } }),
    lobby.when('left', () => { for (const id of [...peers.keys()]) drop(id, true); }),
    lobby.on('hn-emote', (d, from) => {
      const kind = EMOTES.includes(d?.e) ? d.e : null;
      const p = from?.id ? peers.get(from.id) : null;
      if (!kind || !p?.node) return;
      emote(p.node, kind);
      note('emote', p.id, p.name, kind);
    }),
  ];
  // Shared things: whoever simulates one says where it is; everyone else plays it back.
  let thingOff = null;
  const watchThings = (room) => {
    thingOff?.();
    thingOff = room.sync.onThing((id, at, v) => {
      const s = shared.get(id);
      if (!s || room.sync.mine(id)) return;
      s.track.push(at, v.slice(0, 6), id);
    });
  };
  offs.push(lobby.when('joined', (room) => watchThings(room)));

  const tick = scene.onBeforeRenderObservable.add(() => {
    const now = clock();
    const room = lobby.room;
    if (lobby.ready && (player || getPose) && performance.now() - poseAt >= POSE_MS) {
      poseAt = performance.now();
      if (getPose) {
        const g = getPose();
        if (g) lobby.pose(g.position, g.yaw ?? 0, g.extra ?? null);
      } else {
        const w = player.getAbsolutePosition ? player.getAbsolutePosition() : player.position;
        lobby.pose([w.x, w.y, w.z], yawOf(player), null);
      }
    }
    const perf = performance.now();
    for (const [id, l] of leaving) {
      const t = (perf - l.t0) / LEAVE_MS;
      if (t >= 1) { l.node.dispose(false, true); leaving.delete(id); continue; }
      for (const [m, v] of l.base) m.visibility = v * (1 - t);
      l.node.position.y += 0.012;
    }
    for (const r of [...rings]) {
      const t = (perf - r.t0) / 700;
      if (t >= 1) { r.m.dispose(); r.mat.dispose(); rings.delete(r); continue; }
      r.m.scaling.setAll(0.6 + 2.4 * t); r.mat.alpha = 1 - t;
    }
    for (const e of [...emotes]) { e.update(perf); if (e.done) emotes.delete(e); }
    for (const p of peers.values()) {
      if (!p.node) continue;
      if (p.spawnAt) {
        const t = (perf - p.spawnAt) / SPAWN_MS;
        if (t >= 1) { p.spawnAt = 0; if (p.baseScale && p.node.scaling) p.node.scaling.copyFrom(p.baseScale); setAway(p); }
        else if (p.node.scaling && p.baseScale) { p.node.scaling.copyFrom(p.baseScale).scaleInPlace(Math.max(0.01, easeOutBack(t))); setAway(p); }
      }
      const v = p.track.sample(now);
      if (!v) continue;
      p.node.position.set(v[0], v[1], v[2]);
      if (p.node.rotationQuaternion) p.node.rotationQuaternion = B.Quaternion.FromEulerAngles(0, v[3], 0);
      else p.node.rotation.y = v[3];
    }
    if (room) {
      for (const [id, s] of shared) {
        // Mine: its owner's, or (nobody's) the host's; the next host takes over by itself.
        if (lobby.ready && room.sync.mine(id)) {
          const r = s.node.rotationQuaternion ? s.node.rotationQuaternion.toEulerAngles() : s.node.rotation;
          room.sync.push(id, [s.node.position.x, s.node.position.y, s.node.position.z, r.x, r.y, r.z]);
        } else {
          const v = s.track.sample(now);
          if (!v) continue;
          s.node.position.set(v[0], v[1], v[2]);
          if (v.length >= 6) {
            if (s.node.rotationQuaternion) s.node.rotationQuaternion = B.Quaternion.FromEulerAngles(v[3], v[4], v[5]);
            else s.node.rotation.set(v[3], v[4], v[5]);
          }
        }
      }
    }
  });

  const doEmote = (kind = 'wave') => {
    if (!EMOTES.includes(kind) || performance.now() - lastEmote < EMOTE_GAP_MS) return false;
    lastEmote = performance.now();
    if (player) emote(player, kind);
    lobby.send('hn-emote', { e: kind });
    note('emote', lobby.id ?? 'me', o.name ?? '', kind);
    return true;
  };
  const onKey = (ev) => {
    const kind = emoteKeys && emoteKeys[String(ev.key).toLowerCase()];
    const t = ev.target;
    if (!kind || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
    doEmote(kind);
  };
  if (emoteKeys && typeof addEventListener === 'function') addEventListener('keydown', onKey);

  lobby.join(area);

  return {
    lobby,
    /** Play an emote ('wave') on your player; everyone else sees it on your avatar. False inside the short cooldown. */
    emote: doEmote,
    /** fn({ type: 'spawn' | 'leave' | 'emote', id, name, emote?, at }) as players pop in, fade out and wave (yours too). Returns off(). */
    onPresence: (fn) => { presenceFns.add(fn); return () => presenceFns.delete(fn); },
    /** The last 50 presence events. */
    presence,
    /** Avatars fading out right now: id -> { node }. */
    leaving,
    /** Everyone else: id -> { id, name, away, node }. */
    peers,
    get room() { return lobby.room; },
    get ready() { return lobby.ready; },
    get isHost() { return Boolean(lobby.room?.isHost); },
    /** A message to the room (reliable by default; opt: { reliable, to, key }). */
    send: (kind, data, opt) => lobby.send(kind, data, opt),
    /** fn(data, from, meta) for messages of a kind ('*' for all). Returns off(). */
    on: (kind, fn) => lobby.on(kind, fn),
    /** status, joined, left, peer:join, peer:leave, peer:away, away, host, problem. Returns off(). */
    when: (event, fn) => lobby.when(event, fn),
    /** Move to another area's room (the avatars are rebuilt from the new room's poses). */
    join: (a) => { for (const id of [...peers.keys()]) drop(id, true); lobby.join(a); },
    /** A moving thing everyone sees: o.owner 'host' (default: the host simulates it, and the next host takes over) or
     *  'claim' (whoever calls take(id) simulates it, e.g. the player who grabbed it). */
    share(node, id, so = {}) {
      shared.set(id, { node, owner: so.owner ?? 'host', track: new Track({ pos: [0, 1, 2], euler: [3, 4, 5] }, { clock }) });
      return { take: () => Boolean(lobby.room?.sync.claim(id)), release: () => lobby.room?.sync.release(id), mine: () => Boolean(lobby.room?.sync.mine(id)) };
    },
    unshare: (id) => shared.delete(id),
    /** Leave and remove every avatar and hook. */
    dispose() {
      scene.onBeforeRenderObservable.remove(tick);
      for (const off of offs) off();
      thingOff?.();
      if (emoteKeys && typeof removeEventListener === 'function') removeEventListener('keydown', onKey);
      for (const id of [...peers.keys()]) drop(id, true);
      for (const l of leaving.values()) l.node.dispose(false, true);
      leaving.clear();
      for (const e of emotes) e.dispose();
      for (const r of rings) { r.m.dispose(); r.mat.dispose(); }
      rings.clear();
      shared.clear();
      lobby.leave();
    },
  };
}

export default { multiplayer, defaultAvatar, playEmote, background, inBackground, VERSION };
