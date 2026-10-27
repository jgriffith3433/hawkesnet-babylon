// Hawkes Net for Babylon.js (https://net.hawkesgen.com): multiplayer for a Babylon scene in a few lines. A shared room per
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
export const VERSION = '0.1.2';

const POSE_MS = 50;
const AWAY_ALPHA = 0.35;
const yawOf = (node) => {
  if (node.rotationQuaternion) {
    const q = node.rotationQuaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  }
  return node.rotation?.y ?? 0;
};
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
 * Multiplayer for a Babylon scene. o: {
 *   babylon (the BABYLON namespace: import * as BABYLON from '@babylonjs/core', or the global build; default globalThis.BABYLON),
 *   project, name, area ('lobby'), liveHosts ([]), prefix, endpoint, transport ('relay'), key (servers and tests only),
 *   player (the mesh or node whose place and heading are yours; or getPose: () => ({ position: [x, y, z], yaw, extra })),
 *   avatar ((peer, BABYLON, scene) => a node: how others look; default a capsule with their name),
 *   ... any other lobby / join option }
 */
export function multiplayer(scene, o = {}) {
  const B = o.babylon ?? globalThis.BABYLON;
  if (!B) throw new Error('hawkes-net-babylon: pass { babylon: BABYLON } (import * as BABYLON from "@babylonjs/core")');
  const { babylon, area = 'lobby', player, getPose, avatar = defaultAvatar, ...rest } = o;
  // (An option given as undefined, `endpoint: q.get('net') || undefined`, must not override the SDK's default.)
  const join = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  const lobby = makeLobby({ transport: 'relay', ...join });
  const peers = new Map(); // id -> { id, name, away, node, track }
  const shared = new Map(); // id -> { node, track, owner }
  const clock = () => (lobby.room ? lobby.room.now() : Date.now());
  let poseAt = 0;

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
    for (const m of [p.node, ...p.node.getChildMeshes(false)]) if ('visibility' in m) m.visibility = p.away ? AWAY_ALPHA : 1;
  };
  const drop = (id) => {
    const p = peers.get(id);
    if (!p) return;
    p.node?.dispose(false, true);
    peers.delete(id);
  };

  const offs = [
    lobby.onPose((id, s, at) => {
      if (!Array.isArray(s?.p)) return;
      const p = ensure(id);
      p.track.push(at, [s.p[0], s.p[1], s.p[2], s.y ?? 0], id);
      p.extra = s;
      if (!p.node) { p.node = avatar({ id, name: p.name }, B, scene); setAway(p); }
    }),
    lobby.when('peer:join', (peer) => { const p = ensure(peer.id); p.name = peer.name ?? p.name; }),
    lobby.when('peer:leave', ({ peer }) => drop(peer.id)),
    lobby.when('peer:away', ({ peer, away }) => { const p = peers.get(peer.id); if (p) { p.away = away; setAway(p); } }),
    lobby.when('left', () => { for (const id of [...peers.keys()]) drop(id); }),
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
    for (const p of peers.values()) {
      if (!p.node) continue;
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

  lobby.join(area);

  return {
    lobby,
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
    join: (a) => { for (const id of [...peers.keys()]) drop(id); lobby.join(a); },
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
      for (const id of [...peers.keys()]) drop(id);
      shared.clear();
      lobby.leave();
    },
  };
}

export default { multiplayer, defaultAvatar, background, inBackground, VERSION };
