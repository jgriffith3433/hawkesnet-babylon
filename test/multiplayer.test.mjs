// Two Babylon scenes (NullEngine) in one test room on a Hawkes Net started in this process (a hawkesnet checkout:
// HAWKESNET, default ../hawkesnet): A's player moves and B's avatar of A follows it; the host moves a shared crate and B
// sees it move; A goes away and B's avatar of A fades; leaving removes it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as BABYLON from '@babylonjs/core';
import { multiplayer } from '../hawkes-net-babylon.mjs';

const net = process.env.HAWKESNET ?? path.resolve(import.meta.dirname, '..', '..', 'hawkesnet');
const { startTestHub } = await import(pathToFileURL(path.join(net, 'test', 'helper.ts')).href);
const hub = await startTestHub();
test.after(async () => { await hub.stop(); });

const wait = async (pred, ms = 8000, what = 'condition') => {
  const until = Date.now() + ms;
  for (;;) { if (pred()) return; if (Date.now() > until) throw new Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 20)); }
};
function world(name) {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  new BABYLON.FreeCamera('cam', new BABYLON.Vector3(0, 5, -10), scene);
  const player = BABYLON.MeshBuilder.CreateBox(`${name}-player`, { size: 1 }, scene);
  const crate = BABYLON.MeshBuilder.CreateBox(`${name}-crate`, { size: 0.5 }, scene);
  const timer = setInterval(() => scene.render(), 16);
  const mp = multiplayer(scene, { babylon: BABYLON, project: 'netdemo', endpoint: hub.endpoint, name, player, area: `babylon-${process.pid}`, leaveOnHide: false, log: false });
  const shared = mp.share(crate, 'crate-1');
  return { engine, scene, player, crate, mp, shared, stop: () => { clearInterval(timer); mp.dispose(); engine.dispose(); } };
}

test('two Babylon scenes: avatars follow, a shared crate moves for everyone, away fades, leaving removes', async () => {
  const a = world('Ada');
  await wait(() => a.mp.ready, 8000, 'Ada in the room');
  const b = world('Bo');
  try {
    await wait(() => b.mp.ready && a.mp.peers.size === 1 && b.mp.peers.size === 1, 8000, 'both see each other');
    assert.equal(a.mp.isHost, true, 'the first in hosts');
    a.player.position.set(3, 0, 4);
    a.player.rotation.y = 1.2;
    const av = () => b.mp.peers.values().next().value?.node;
    await wait(() => av() && Math.abs(av().position.x - 3) < 0.05 && Math.abs(av().position.z - 4) < 0.05, 8000, "B's avatar of Ada at her place");
    assert.ok(Math.abs(av().rotation.y - 1.2) < 0.05, 'and facing her way');
    assert.equal(b.mp.peers.values().next().value.name, 'Ada', 'with her name');

    // The host (Ada) simulates the crate: Bo's copy follows.
    a.crate.position.set(-2, 1, 5);
    await wait(() => Math.abs(b.crate.position.x + 2) < 0.05 && Math.abs(b.crate.position.z - 5) < 0.05, 8000, "Bo's crate where Ada's is");
    // Bo takes it (he grabbed it): now Ada's copy follows his.
    assert.equal(b.shared.take(), true);
    await wait(() => a.mp.room.sync.mine('crate-1') === false, 4000, 'Ada hears Bo took it');
    b.crate.position.set(6, 0, -1);
    await wait(() => Math.abs(a.crate.position.x - 6) < 0.05, 8000, "Ada's crate where Bo put it");

    a.mp.room.setAway(true);
    await wait(() => av()?.getChildMeshes()[0]?.visibility < 0.5, 4000, "Ada's avatar faded for Bo");
    a.mp.room.setAway(false);
    await wait(() => av()?.getChildMeshes()[0]?.visibility === 1, 4000, 'and back');

    a.stop();
    await wait(() => b.mp.peers.size === 0, 30000, 'Ada gone for Bo');
    assert.equal(b.scene.getMeshByName('hn-body-' + a.mp.room?.id), null);
  } finally { b.stop(); try { a.stop(); } catch { /* stopped */ } }
});

test('presence: a joining player pops in, E waves for the other scene, a leaving player fades out', async () => {
  const a = world('Cy');
  await wait(() => a.mp.ready, 8000, 'Cy in the room');
  const b = world('Di');
  try {
    await wait(() => a.mp.peers.size === 1 && b.mp.peers.size === 1, 8000, 'both see each other');
    // Spawn: Cy saw Di appear small and see-through, growing to full size; the ring opened under it.
    await wait(() => a.mp.presence.some((e) => e.type === 'spawn'), 8000, "Di's first pose");
    const spawn = a.mp.presence.find((e) => e.type === 'spawn');
    assert.equal(spawn?.name, 'Di', 'Cy got a spawn event for Di');
    const peer = a.mp.peers.values().next().value;
    await wait(() => a.scene.getMeshByName('hn-spawn-ring') !== null || peer.spawnAt === 0, 2000, 'a spawn ring or the pop finished');
    await wait(() => peer.node.scaling.x === 1 && peer.node.getChildMeshes()[0].visibility === 1, 4000, 'the pop settles at full size');

    // Wave: a real key press in Di's page (a keydown on the window) shows an arm on Di's avatar for Cy.
    assert.equal(b.mp.emote('wave'), true, 'Di waves');
    assert.equal(b.mp.emote('wave'), false, 'but not twice in a row');
    await wait(() => a.mp.presence.some((e) => e.type === 'emote' && e.name === 'Di'), 4000, 'Cy sees the wave');
    assert.ok(peer.node.getChildMeshes().some((m) => m.name.startsWith('hn-emote-arm')), "the arm is on Di's avatar");
    assert.ok(b.player.getChildMeshes().some((m) => m.name.startsWith('hn-emote-arm')), 'and on Di own player');
    await wait(() => !peer.node.getChildMeshes().some((m) => m.name.startsWith('hn-emote-arm')), 4000, 'the arm goes down again');

    // Leave: Di's avatar fades (still there, see-through), then is gone.
    const id = peer.id;
    b.stop();
    await wait(() => a.mp.leaving.has(id), 30000, "Di's avatar starts fading");
    assert.ok(a.mp.presence.some((e) => e.type === 'leave' && e.name === 'Di'), 'a leave event');
    const node = a.mp.leaving.get(id).node;
    await wait(() => { const v = node.getChildMeshes()[0]?.visibility; return v !== undefined && v < 1; }, 2000, 'visibility dropping');
    await wait(() => !a.mp.leaving.has(id) && node.isDisposed(), 4000, 'fully faded and removed');
  } finally { try { b.stop(); } catch { /* stopped */ } a.stop(); }
});
